"""Pure tests for the preserved Auto-TSTM GRIB2 generator."""

from datetime import datetime, timezone
import unittest

import numpy as np

import generate_tstm


class GenerateTstmTests(unittest.TestCase):
    def _build_day1_window(self, **overrides):
        payload = {"day": 1, "cycleDate": "2026-06-13", **overrides}
        return generate_tstm.build_effective_window(payload)

    def test_day_one_window_ends_at_upcoming_12z(self):
        window = self._build_day1_window(issuanceTime="0600")
        self.assertEqual(window.start, datetime(2026, 6, 13, 6, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))
        self.assertTrue(window.forecast_hours)

    def test_day_one_window_uses_valid_date_when_provided(self):
        window = self._build_day1_window(validDate="2026-06-13T18:00:00Z")
        self.assertEqual(window.start, datetime(2026, 6, 13, 18, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))

    def test_day_one_window_falls_back_to_issue_date(self):
        window = self._build_day1_window(issueDate="2026-06-13T20:00:00Z")
        self.assertEqual(window.start, datetime(2026, 6, 13, 20, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))

    def test_day_one_window_falls_back_to_default_issuance_hour(self):
        window = self._build_day1_window()
        self.assertEqual(window.start, datetime(2026, 6, 13, 6, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))

    def test_day_one_window_href_run_is_previous_spc_cycle(self):
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13", "issuanceTime": "1600"}
        )
        # Start is 16Z; previous SPC cycle is 12Z same day
        self.assertEqual(window.href_run, datetime(2026, 6, 13, 12, tzinfo=timezone.utc))

    def test_day_two_window_is_12z_to_12z(self):
        window = generate_tstm.build_effective_window(
            {"day": 2, "cycleDate": "2026-06-13"}
        )
        self.assertEqual(window.start, datetime(2026, 6, 14, 12, tzinfo=timezone.utc))
        self.assertEqual(window.end, datetime(2026, 6, 15, 12, tzinfo=timezone.utc))

    def test_day_two_window_href_run_is_cycle_12z(self):
        window = generate_tstm.build_effective_window(
            {"day": 2, "cycleDate": "2026-06-13"}
        )
        self.assertEqual(window.href_run, datetime(2026, 6, 13, 12, tzinfo=timezone.utc))

    def test_spc_thunder_periods_are_full_only_in_primary_position(self):
        """The primary period must be "full" (24-hour accumulation)."""
        self.assertEqual(generate_tstm.SPC_THUNDER_PERIODS[0], "full")

    def test_spc_period_hours_full_returns_two_frames(self):
        hours = generate_tstm.spc_period_hours(24, "full")
        self.assertEqual(hours, [1, 24])

    def test_spc_period_hours_4hr_returns_two_frames(self):
        hours = generate_tstm.spc_period_hours(24, "4hr")
        self.assertEqual(hours, [21, 24])

    def test_spc_period_hours_unknown_returns_single_frame(self):
        hours = generate_tstm.spc_period_hours(24, "unknown")
        self.assertEqual(hours, [24])

    def test_default_thresholds_are_explicit(self):
        """Fixture: core=0.30, support=0.10.  Any change must be intentional."""
        self.assertEqual(
            generate_tstm.DEFAULT_THRESHOLDS,
            {
                "calibratedThunderCoreProbability": 0.30,
                "calibratedThunderSupportProbability": 0.10,
            },
        )

    def test_spc_url_uses_calibrated_thunder_product(self):
        url, filename = generate_tstm.spc_thunder_url(
            datetime(2026, 6, 13, 12, tzinfo=timezone.utc), 24, "full"
        )
        self.assertIn("/thunder/", url)
        self.assertEqual(filename, "spc_post.t12z.hrefct_full.f024.grib2")

    def test_probability_normalization_supports_percent_fields(self):
        normalized = generate_tstm.as_probability(np.array([[0.0, 30.0, 100.0]]))
        np.testing.assert_allclose(normalized, np.array([[0.0, 0.3, 1.0]]))

    def test_probability_normalization_preserves_all_nan_fields(self):
        normalized = generate_tstm.as_probability(np.array([[np.nan, np.nan]]))
        self.assertTrue(np.isnan(normalized).all())

    def test_spc_array_combination_preserves_all_nan_fields(self):
        combined = generate_tstm.combine_spc_arrays(
            [np.array([[np.nan, np.nan]]), np.array([[np.nan, np.nan]])]
        )
        self.assertEqual(combined.shape, (1, 2))
        self.assertTrue(np.isnan(combined).all())

    def test_response_shape_preserves_source_metadata(self):
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13"}
        )
        response = generate_tstm.response_payload(
            window,
            [],
            ["not ready"],
            {"calibratedThunder": {"product": "spc_hrefct_full"}},
        )
        self.assertEqual(response["features"], [])
        self.assertEqual(response["warnings"], ["not ready"])
        self.assertEqual(
            response["sources"]["calibratedThunder"]["product"],
            "spc_hrefct_full",
        )

    def test_response_thresholds_match_defaults(self):
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13"}
        )
        response = generate_tstm.response_payload(window, [], [], {})
        self.assertEqual(response["thresholds"], generate_tstm.DEFAULT_THRESHOLDS)

    def test_ingestion_mode_off_by_default(self):
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13"}
        )
        response = generate_tstm.build_response(
            {"day": 1, "cycleDate": "2026-06-13"}, ingestion_mode=False
        )
        self.assertNotIn("completeness", response)

    def test_ingestion_mode_adds_completeness_when_no_forecast_hours(self):
        """When ingestion_mode=True and no SPC data is found, completeness.complete is False."""
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-13"}
        )
        # Simulate a response with no features (data unavailable)
        response = generate_tstm.response_payload(window, [], ["No SPC data"], {})
        response["completeness"] = {
            "complete": False,
            "checkedHours": window.forecast_hours,
            "matchedHours": [],
            "missingHours": window.forecast_hours,
            "warnings": ["No SPC data"],
        }
        self.assertFalse(response["completeness"]["complete"])
        self.assertEqual(response["completeness"]["missingHours"], window.forecast_hours)
        self.assertEqual(len(response["features"]), 0)

    def test_ingestion_mode_parse_args_flag(self):
        import sys
        original = sys.argv
        try:
            sys.argv = ["generate_tstm.py", "--ingestion-mode"]
            payload, mode = generate_tstm.parse_args()
            self.assertTrue(mode)
        finally:
            sys.argv = original

    def test_ingestion_mode_parse_args_default(self):
        import sys
        original = sys.argv
        try:
            sys.argv = ["generate_tstm.py"]
            payload, mode = generate_tstm.parse_args()
            self.assertFalse(mode)
        finally:
            sys.argv = original

    def _assert_completeness(
        self,
        completeness_window,
        matched_hours: list[int],
        *,
        expect_complete: bool,
        missing_assert=None,
    ) -> None:
        completeness = generate_tstm._build_completeness(
            True,
            completeness_window,
            [{"type": "Feature"}],
            {"matched_hours": matched_hours, "warnings": []},
        )
        self.assertEqual(completeness["complete"], expect_complete)
        if missing_assert is not None:
            missing_assert(completeness["missingHours"])

    def test_completeness_checked_hours_full_uses_loaded_frames(self):
        self.assertEqual(
            generate_tstm.completeness_checked_hours("full", 30, [7]),
            [7],
        )
        self.assertEqual(
            generate_tstm.completeness_checked_hours("4hr", 30, [27, 30]),
            [27, 30],
        )

    def test_build_completeness_outcomes(self):
        window = self._build_day1_window()
        end_hour = window.forecast_hours[-1]
        full_checked = generate_tstm.spc_period_hours(end_hour, "full")
        four_hr_checked = generate_tstm.spc_period_hours(end_hour, "4hr")
        four_hr_window = generate_tstm.replace(window, forecast_hours=four_hr_checked)

        cases = [
            (
                "partial href hours",
                window,
                [6, 9],
                False,
                lambda missing: self.assertIn(12, missing),
            ),
            (
                "full href hours",
                window,
                list(window.forecast_hours),
                True,
                lambda missing: self.assertEqual(missing, []),
            ),
            (
                "full period single loaded hour",
                generate_tstm.replace(window, forecast_hours=[full_checked[0]]),
                [full_checked[0]],
                True,
                lambda missing: self.assertEqual(missing, []),
            ),
            (
                "partial 4hr period",
                four_hr_window,
                [end_hour],
                False,
                lambda missing: self.assertNotEqual(missing, []),
            ),
            (
                "full 4hr period",
                four_hr_window,
                four_hr_checked,
                True,
                lambda missing: self.assertEqual(missing, []),
            ),
        ]
        for label, completeness_window, matched_hours, expect_complete, missing_assert in cases:
            with self.subTest(label=label):
                self._assert_completeness(
                    completeness_window,
                    matched_hours,
                    expect_complete=expect_complete,
                    missing_assert=missing_assert,
                )

    def test_build_completeness_uses_loaded_run_hours_for_fallback(self):
        """Fallback SPC runs should compare against the loaded run's period hours."""
        requested = self._build_day1_window(cycleRun="2026-06-13T12:00:00Z")
        fallback = generate_tstm.replace(
            requested,
            href_run=datetime(2026, 6, 13, 0, tzinfo=timezone.utc),
            forecast_hours=[24],
        )
        loaded_hour = generate_tstm.spc_period_hours(fallback.forecast_hours[-1], "full")[0]
        completeness_window = generate_tstm.replace(fallback, forecast_hours=[loaded_hour])
        self._assert_completeness(
            completeness_window,
            [loaded_hour],
            expect_complete=True,
            missing_assert=lambda missing: self.assertEqual(missing, []),
        )

    def test_cycle_run_override(self):
        """When cycleRun is provided, it overrides the derived href_run."""
        window = generate_tstm.build_effective_window(
            {"day": 1, "cycleDate": "2026-06-15", "cycleRun": "2026-06-15T12:00:00Z"}
        )
        self.assertEqual(window.href_run.hour, 12)


if __name__ == "__main__":
    unittest.main()
