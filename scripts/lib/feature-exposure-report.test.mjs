import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPromotionCheckRows,
  classifyFeatureExposure,
  evaluateClientServerAlignment,
  evaluateExperimentalLeakage,
  findNewlyProductionVisible,
  formatExposureReport,
  formatFeatureList,
  generateProductionExposureReport,
  summarizeErrors,
  validatePromotionExposure,
} from './feature-exposure-report.mjs';
import {
  findExistingExposureComment,
  formatPromotionExposureComment,
  escapeMarkdownTableCell,
  PROMOTION_EXPOSURE_COMMENT_MARKER,
} from './pr-exposure-comment.mjs';

const ALL_OFF = { local: false, beta: false, staging: false, production: false };
const ALL_ON = { local: true, beta: true, staging: true, production: true };

const sampleRegistry = {
  core: {
    exposure: { ...ALL_ON },
    temporary: false,
    serverBacked: false,
    trackingIssue: 1,
  },
  betaOnly: {
    exposure: { local: true, beta: true, staging: false, production: false },
    temporary: true,
    removalCondition: 'Ship to production later.',
    serverBacked: false,
    trackingIssue: 2,
  },
  disabled: {
    exposure: { ...ALL_OFF },
    temporary: true,
    removalCondition: 'Remove after launch.',
    serverBacked: false,
    trackingIssue: 3,
  },
  localOnly: {
    exposure: { local: true, beta: false, staging: false, production: false },
    temporary: false,
    serverBacked: false,
    trackingIssue: 4,
  },
};

describe('feature exposure report', () => {
  it('classifies production, beta-only, local-only, and disabled features', () => {
    assert.equal(classifyFeatureExposure(sampleRegistry.core), 'production');
    assert.equal(classifyFeatureExposure(sampleRegistry.betaOnly), 'beta-only');
    assert.equal(classifyFeatureExposure(sampleRegistry.localOnly), 'local-only');
    assert.equal(classifyFeatureExposure(sampleRegistry.disabled), 'disabled');
  });

  it('generates sorted report sections', () => {
    const report = generateProductionExposureReport(sampleRegistry);
    assert.equal(report.summary.production, 1);
    assert.equal(report.summary.betaOnly, 1);
    assert.equal(report.summary.localOnly, 1);
    assert.equal(report.summary.disabled, 1);
    assert.deepEqual(
      report.sections.production.map((entry) => entry.featureKey),
      ['core']
    );
  });

  it('formats feature lists with counts', () => {
    assert.equal(formatFeatureList([]), '—');
    assert.equal(formatFeatureList([{ featureKey: 'a' }, { featureKey: 'b' }]), 'a, b (2)');
    assert.match(
      formatFeatureList([
        { featureKey: 'a' },
        { featureKey: 'b' },
        { featureKey: 'c' },
        { featureKey: 'd' },
        { featureKey: 'e' },
        { featureKey: 'f' },
      ]),
      /… \(6\)$/u
    );
  });

  it('detects newly production-visible features against main', () => {
    const baseRegistry = {
      staged: {
        exposure: { local: true, beta: true, staging: true, production: false },
        temporary: false,
        trackingIssue: 10,
      },
      unchanged: {
        exposure: { ...ALL_ON },
        temporary: false,
        trackingIssue: 11,
      },
    };
    const headRegistry = {
      staged: {
        exposure: { local: true, beta: true, staging: true, production: true },
        temporary: false,
        trackingIssue: 10,
      },
      unchanged: {
        exposure: { ...ALL_ON },
        temporary: false,
        trackingIssue: 11,
      },
    };

    const newlyVisible = findNewlyProductionVisible(baseRegistry, headRegistry);
    assert.deepEqual(newlyVisible.map((entry) => entry.featureKey), ['staged']);
  });

  it('fails experimental leakage for temporary production exposure and new temporary graduates', () => {
    const leakage = evaluateExperimentalLeakage({
      leaky: {
        exposure: { ...ALL_ON },
        temporary: true,
        trackingIssue: 20,
      },
    });
    assert.equal(leakage.ok, false);
    assert.equal(leakage.errors.length, 1);
    assert.match(leakage.errors[0], /leaky/);
    assert.match(leakage.errors[0], /newly production-visible/);

    const headRegistry = {
      graduate: {
        exposure: { ...ALL_ON },
        temporary: true,
        trackingIssue: 21,
      },
    };
    const baseRegistry = {
      graduate: {
        exposure: { ...ALL_OFF },
        temporary: true,
        trackingIssue: 21,
      },
    };
    const newlyVisibleLeakage = evaluateExperimentalLeakage(headRegistry, baseRegistry);
    assert.equal(newlyVisibleLeakage.ok, false);
    assert.equal(newlyVisibleLeakage.errors.length, 1);
    assert.match(newlyVisibleLeakage.errors[0], /graduate/);
    assert.match(newlyVisibleLeakage.errors[0], /newly production-visible/);
  });

  it('reports pre-existing temporary production exposure without a promotion duplicate', () => {
    const headRegistry = {
      leaky: {
        exposure: { ...ALL_ON },
        temporary: true,
        trackingIssue: 22,
      },
    };
    const baseRegistry = {
      leaky: {
        exposure: { ...ALL_ON },
        temporary: true,
        trackingIssue: 22,
      },
    };

    const leakage = evaluateExperimentalLeakage(headRegistry, baseRegistry);
    assert.equal(leakage.ok, false);
    assert.equal(leakage.errors.length, 1);
    assert.match(leakage.errors[0], /exposed on production/);
    assert.doesNotMatch(leakage.errors[0], /newly production-visible/);
  });

  it('validates client/server alignment independently', () => {
    const alignment = evaluateClientServerAlignment(sampleRegistry, {
      autoTstm: {
        serverCapabilityKey: 'TSTM_GENERATION_ENABLED',
        exposure: { ...ALL_OFF },
      },
    });
    assert.equal(alignment.ok, false);
    assert.ok(
      alignment.errors.some((error) => /Server registry feature "autoTstm"/.test(error))
    );
  });

  it('combines policy and leakage failures for promotion validation', () => {
    const promotion = validatePromotionExposure({
      headRegistry: {
        leaky: {
          exposure: { ...ALL_ON },
          temporary: true,
          trackingIssue: 30,
        },
      },
      baseRegistry: {},
      policyResult: { ok: true },
    });
    assert.equal(promotion.ok, false);
    assert.ok(promotion.errors.some((error) => /leaky/.test(error)));
  });

  it('dedupes temporary production violations between policy and leakage checks', () => {
    const headRegistry = {
      leaky: {
        exposure: { ...ALL_ON },
        temporary: true,
        trackingIssue: 30,
      },
    };
    const baseRegistry = {
      leaky: {
        exposure: { ...ALL_ON },
        temporary: true,
        trackingIssue: 30,
      },
    };
    const promotion = validatePromotionExposure({
      headRegistry,
      baseRegistry,
      policyResult: {
        ok: false,
        errors: [
          'Temporary feature "leaky" is exposed on production. Temporary features must not be enabled on production until explicitly promoted.',
        ],
      },
    });

    assert.equal(promotion.ok, false);
    assert.equal(promotion.errors.length, 1);
    assert.match(promotion.errors[0], /leaky.*#30/u);
  });

  it('formats the text exposure report', () => {
    const report = generateProductionExposureReport(sampleRegistry);
    const text = formatExposureReport({ report, newlyProductionVisible: [] });
    assert.match(text, /Production-enabled:/);
    assert.match(text, /Beta-only:/);
    assert.match(text, /Disabled everywhere except local:/);
    assert.match(text, /Newly production-visible \(vs main\):/);
  });

  it('builds promotion check rows with pass and fail details', () => {
    const rows = buildPromotionCheckRows({
      policyResult: { ok: true },
      leakageResult: { ok: true },
      alignmentResult: { ok: true },
      promotionResult: { ok: true },
      registry: sampleRegistry,
    });
    assert.equal(rows.length, 4);
    assert.equal(rows[0].ok, true);
    assert.match(rows[0].details, /4 features validated/);
    assert.equal(rows[3].details, 'Ready to promote');

    const failingRows = buildPromotionCheckRows({
      policyResult: { ok: false, errors: ['Registry broken'] },
      leakageResult: { ok: false, errors: ['Temporary feature "x" is exposed on production (#1).'] },
      alignmentResult: { ok: false, errors: ['Client/server mismatch'] },
      promotionResult: { ok: false, errors: ['Registry broken', 'Temporary feature "x" is exposed on production (#1).'] },
      registry: sampleRegistry,
    });
    assert.equal(failingRows[0].ok, false);
    assert.equal(failingRows[1].ok, false);
    assert.equal(failingRows[2].ok, false);
    assert.equal(failingRows[3].ok, false);
    assert.ok(summarizeErrors(['a', 'b', 'c']).length <= 160);
  });
});

describe('promotion exposure PR comment', () => {
  it('finds the marker-bearing comment', () => {
    const existing = findExistingExposureComment([
      { id: 1, body: 'other comment' },
      { id: 2, body: `${PROMOTION_EXPOSURE_COMMENT_MARKER}\nreport` },
    ]);
    assert.equal(existing?.id, 2);
  });

  it('formats a simple status table with checkmarks', () => {
    const report = generateProductionExposureReport(sampleRegistry);
    const body = formatPromotionExposureComment({
      checkRows: buildPromotionCheckRows({
        policyResult: { ok: true },
        leakageResult: { ok: true },
        alignmentResult: { ok: true },
        promotionResult: { ok: true },
        registry: sampleRegistry,
      }),
      report,
      newlyProductionVisible: [],
      runUrl: 'https://github.com/org/repo/actions/runs/1',
    });

    assert.match(body, new RegExp(`${PROMOTION_EXPOSURE_COMMENT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
    assert.match(body, /\| Registry policy \(FND-06\) \| ✅ \|/u);
    assert.match(body, /\| \*\*Overall\*\* \| ✅ \| Ready to promote \|/u);
    assert.match(body, /\| Production-enabled \| core \(1\) \|/);
    assert.match(body, /pnpm exposure:report/);
  });

  it('escapes markdown table cell values', () => {
    assert.equal(escapeMarkdownTableCell('a|b'), 'a\\|b');
    assert.equal(escapeMarkdownTableCell('a\\b'), 'a\\\\b');
    assert.equal(escapeMarkdownTableCell('line\nbreak'), 'line break');
  });

  it('shows failing rows with x marks and violation details', () => {
    const report = generateProductionExposureReport(sampleRegistry);
    const body = formatPromotionExposureComment({
      checkRows: buildPromotionCheckRows({
        policyResult: { ok: false, errors: ['Registry broken'] },
        leakageResult: { ok: false, errors: ['Temporary feature "leaky" is exposed on production (#1).'] },
        alignmentResult: { ok: true },
        promotionResult: { ok: false, errors: ['Registry broken'] },
        registry: sampleRegistry,
      }),
      report,
      newlyProductionVisible: [],
    });

    assert.match(body, /\| Registry policy \(FND-06\) \| ❌ \| Registry broken \|/u);
    assert.match(body, /\| No experimental leakage to production \| ❌ \|/u);
    assert.match(body, /\| \*\*Overall\*\* \| ❌ \|/u);
  });
});
