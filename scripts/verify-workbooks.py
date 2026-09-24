"""Read-only validation of authored XLSX assets with the Python standard library."""
from pathlib import Path
import hashlib
import json
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
catalog = json.loads((ROOT / 'content/workbooks/catalog.json').read_text())

def json_file(relative):
    return json.loads((ROOT / 'content' / relative).read_text())

def cells(package, sheet):
    tree = ET.fromstring(package.read(f'xl/worksheets/sheet{sheet}.xml'))
    result = {}
    for cell in tree.findall('.//s:c', NS):
        kind = cell.get('t')
        value = cell.find('s:v', NS)
        if kind == 'inlineStr':
            parsed = ''.join(cell.itertext())
        elif value is None:
            parsed = None
        elif kind == 'b':
            parsed = value.text == '1'
        elif kind in ('str', 'e'):
            parsed = value.text
        else:
            parsed = float(value.text)
        result[cell.get('r')] = parsed
    return tree, result

total = 0
for entry in catalog['workbooks']:
    file = ROOT / 'content' / entry['path']
    assert hashlib.sha256(file.read_bytes()).hexdigest() == entry['sha256']
    assert file.stat().st_size == entry['byteLength']
    key = file.stem
    manifest_bytes = (ROOT / f'content/{key}/1.0.0/manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    assert hashlib.sha256(manifest_bytes).hexdigest() == entry['manifestSha256']
    assert manifest['taskVersionId'] == entry['taskVersionId']
    assets = {asset['assetKey']: asset for asset in manifest['assets']}
    for source in entry['sources']:
        asset = assets[source['assetKey']]
        assert asset['visibility'] == 'PUBLIC'
        assert asset['sha256'] == source['sha256']
    source_key = {'ai-support': 'practice-public', 'ds-learning': 'learner-activity', 'ba-learning': 'weekly-funnel'}[key]
    source = json_file(f'{key}/1.0.0/{source_key}.json')
    if key == 'ai-support':
        expected = [[row['sampleId'], row['messageText'], row['baseline']['routedLabel'], row['goldLabel']] for row in source]
    else:
        fields = json_file(f'{key}/1.0.0/data-dictionary.json')['fields']
        expected = [[row[field['fieldKey']] for field in fields] for row in source]
    assert len(expected) == entry['rowCount']
    with zipfile.ZipFile(file) as package:
        assert package.testzip() is None
        tree, raw = cells(package, 2)
        assert not tree.findall('.//s:f', NS), 'Raw data must not contain formulas'
        assert tree.find('.//s:pane', NS).get('ySplit') == '5'
        workbook = ET.fromstring(package.read('xl/workbook.xml'))
        assert [s.get('name') for s in workbook.findall('s:sheets/s:sheet', NS)] == ['练习区', '原始数据', '字段说明']
        assert all(s.get('state', 'visible') == 'visible' for s in workbook.findall('s:sheets/s:sheet', NS))
        for index, values in enumerate(expected):
            expected_row = [f'raw-{index + 1:03d}'] + values
            for column, value in enumerate(expected_row):
                address = f'{chr(65 + column)}{index + 6}'
                if isinstance(value, bool):
                    value = '是' if value else '否'
                assert raw.get(address) == value, (key, address, raw.get(address), value)
                total += 1
        _, exercise = cells(package, 1)
        assert abs(exercise['B8'] - (5 / 6 if key == 'ai-support' else .4)) < 1e-12
        if key == 'ds-learning':
            assert len(source) == 360 and len({r['learner_id'] for r in source}) == 359
            assert sum(r['days_to_first_lesson'] is None for r in source) > 0
            assert sum(r['days_to_first_lesson'] == 0 for r in source) > 0
        if key == 'ai-support':
            text = ''.join(package.read(n).decode('utf-8-sig') for n in package.namelist())
            for marker in ['evaluation-', 'training-', 'golden-private', 'review-private', '/Users/', 'file:']:
                assert marker not in text, marker
        print(f'PASS {key}: {entry["rowCount"]} original rows, types/blanks/IDs preserved, teaching formula cached')
print(f'PASS: {total} raw cells compared against PUBLIC source assets. Native Excel open/recalculation not verified.')
