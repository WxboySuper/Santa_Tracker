import { geometryFromKmlElement } from './kmlGeometry';
import { parseKmlDocument } from './parseKml';

const sampleKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder><name>Day 1</name><Folder><name>Tornado</name><Placemark>
      <name>Tornado 15%</name>
      <ExtendedData><Data name="gfc_day"><value>1</value></Data><Data name="gfc_outlook_type"><value>tornado</value></Data><Data name="gfc_probability_key"><value>15%</value></Data></ExtendedData>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-98,34,0 -96,34,0 -96,36,0 -98,36,0 -98,34,0</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark></Folder></Folder>
  </Document>
</kml>`;

describe('kmlGeometry', () => {
  test('parses polygon coordinates from namespaced KML', () => {
    const document = new DOMParser().parseFromString(sampleKml, 'application/xml');
    const placemark = Array.from(document.getElementsByTagName('*'))
      .find((node) => (node.localName ?? node.tagName).toLowerCase() === 'placemark');

    expect(placemark).toBeTruthy();
    const feature = geometryFromKmlElement(placemark as Element);
    expect(feature?.geometry.type).toBe('Polygon');
  });

  test('parseKmlDocument reads minimal exported-style KML', () => {
    const { placemarks } = parseKmlDocument(sampleKml, 1);
    expect(placemarks).toHaveLength(1);
    expect(placemarks[0].probabilityKey).toBe('15%');
  });
});
