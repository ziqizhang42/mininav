from routing.access import permits_driving


def test_allows_driving_by_default() -> None:
    assert permits_driving({}) is True


def test_rejects_access_no() -> None:
    assert permits_driving({"access": "no"}) is False


def test_rejects_private_access() -> None:
    assert permits_driving({"access": "private"}) is False


def test_rejects_motor_vehicle_no() -> None:
    assert permits_driving({"motor_vehicle": "no"}) is False


def test_specific_permission_overrides_general_access() -> None:
    tags = {"access": "no", "motor_vehicle": "yes"}

    assert permits_driving(tags) is True


def test_allows_destination_access() -> None:
    assert permits_driving({"access": "destination"}) is True
