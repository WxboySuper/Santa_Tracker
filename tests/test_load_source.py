import json

from src.utils.locations import _load_source_to_obj


def test_load_source_parses_json_string():
    s = json.dumps({"route": [{"id": "a", "location": {"lat": 1, "lng": 2}}]})
    obj, loaded_from_file = _load_source_to_obj(s)
    assert isinstance(obj, dict)
    assert obj["route"][0]["id"] == "a"
    assert loaded_from_file is False


def test_load_source_returns_object_unchanged():
    data = {"route": [{"id": "x"}]}
    obj, loaded_from_file = _load_source_to_obj(data)
    assert obj is data
    assert loaded_from_file is False
