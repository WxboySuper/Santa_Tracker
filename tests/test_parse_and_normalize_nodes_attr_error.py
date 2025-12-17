import pytest
from src.utils.locations import _parse_and_normalize_nodes


class BadDict(dict):
    def get(self, *args, **kwargs):
        raise AttributeError("boom")


def test_parse_and_normalize_nodes_logs_attribute_error(caplog):
    caplog.set_level("WARNING")
    nodes = [BadDict()]
    parsed = _parse_and_normalize_nodes(nodes)
    assert parsed == []
    assert any("skipping node at index 0: boom" in rec.getMessage() for rec in caplog.records)
