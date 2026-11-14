export function parseCoordinates(latitude, longitude) {
  function coordinate(value, name, limit) {
    const text = String(value ?? '').trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
      throw new Error(name + ' must be a decimal number. Use a minus sign for south/west.');
    }
    const result = Number(text);
    if (!Number.isFinite(result) || Math.abs(result) > limit) {
      throw new Error(name + ' must be between ' + (-limit) + ' and ' + limit + '.');
    }
    return result;
  }
  return { lat: coordinate(latitude, 'Latitude', 90), lng: coordinate(longitude, 'Longitude', 180) };
}
