import pytest
from src.utils.locations import _get_nodes_from_obj


def test_get_nodes_from_obj_with_list_returns_same_list():
    data = [1, 2, 3]
    nodes = _get_nodes_from_obj(data)
    assert nodes is data


def test_get_nodes_from_obj_with_dict_and_nonlist_nodes_raises_value_error():
    data = {"route": "not-a-list"}
    with pytest.raises(ValueError) as exc:
        _get_nodes_from_obj(data)
    assert "unable to locate nodes list in input JSON" in str(exc.value)


def test_get_nodes_from_obj_with_invalid_type_raises_type_error():
    with pytest.raises(TypeError) as exc:
        _get_nodes_from_obj(123)
    assert "input must be JSON string, dict, list, or path to a JSON file" in str(
        exc.value
    )
