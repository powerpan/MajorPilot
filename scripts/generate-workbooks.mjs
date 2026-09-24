// Authoring only. Run with the bundled artifact runtime; ordinary tests never regenerate assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

assert(process.env.MP_ARTIFACT_RUNTIME, 'Set MP_ARTIFACT_RUNTIME to the bundled Node runtime directory');
const require = createRequire(path.join(process.env.MP_ARTIFACT_RUNTIME, 'package.json'));
const { Workbook, SpreadsheetFile } = await import(require.resolve('@oai/artifact-tool'));
const root = fileURLToPath(new URL('../', import.meta.url));
const preview = process.env.MP_WORKBOOK_PREVIEWS;
assert(preview, 'Set MP_WORKBOOK_PREVIEWS to a temporary output directory');
const output = preview;
const published = path.join(root, 'content/workbooks/1.0.0');
await fs.mkdir(published, { recursive: true });
await fs.mkdir(output, { recursive: true });
await fs.mkdir(preview, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const read = async name => JSON.parse(await fs.readFile(path.join(root, 'content', name), 'utf8'));
const literal = value => typeof value === 'string' && /^[=+@-]/.test(value) ? `'${value}` : value;
const definitions = [
  { key: 'ai-support', major: 'AI', title: '消息分类练习材料', source: 'practice-public', extra: 'example-pool', question: '找两条分错的消息，说明它们有什么共同点。', fields: ['消息ID与依据', '想减少哪种错误', '只改哪个因素，为什么', '预期效果和可能代价'] },
  { key: 'ds-learning', major: 'DATA_SCIENCE', title: '学习记录原始数据', source: 'learner-activity', question: '更早开始上课与完成课程有什么关系？', fields: ['重复与空白的处理决定', '保留和排除的范围', '两组人数与完成人数', '按课程再看后的发现', '哪些原因还不能确定'] },
  { key: 'ba-learning', major: 'BUSINESS_ANALYTICS', title: '学习环节聚合数据', source: 'weekly-funnel', question: '学员在哪一步没有继续，我们先改善什么？', fields: ['第1至6批与第7至12批的计数', '相邻环节比例和未继续人数', '优先环节、群体及理由', '已看到什么，可能为什么', '先了解障碍还是小范围试验', '怎样判断有帮助和额外负担'] },
];
const catalog = { schemaVersion: 'workbook-catalog-v1', generatorVersion: 'artifact-tool-workbooks-v1', workbooks: [] };
for (const def of definitions) {
  const manifestPath = `${def.key}/1.0.0/manifest.json`;
  const manifestRaw = await fs.readFile(path.join(root, 'content', manifestPath));
  const manifest = JSON.parse(manifestRaw);
  const keys = [def.source, ...(def.extra ? [def.extra] : ['data-dictionary'])];
  const sources = keys.map(key => {
    const asset = manifest.assets.find(item => item.assetKey === key);
    assert(asset?.visibility === 'PUBLIC', 'Only explicitly public assets may enter workbooks');
    return { assetKey: key, sha256: asset.sha256 };
  });
  const source = await read(`${def.key}/1.0.0/${def.source}.json`);
  const wb = Workbook.create();
  const practice = wb.worksheets.add('练习区'), raw = wb.worksheets.add('原始数据'), dictionary = wb.worksheets.add('字段说明');
  for (const sheet of [practice, raw, dictionary]) sheet.showGridLines = false;
  const practiceRows = [
    ['', ''], [def.title, ''], ['文件版本', '1.0.0'], ['这次的问题', def.question],
    ['以下只是教学小例子', '不是原始数据的统计结果，可修改人数观察比例变化。'],
    [def.major === 'AI' ? '自动处理的消息数' : def.major === 'DATA_SCIENCE' ? '小例子中这一组的人数' : '小例子中的报名人数', def.major === 'AI' ? 6 : 100],
    [def.major === 'AI' ? '其中分对的消息数' : '其中完成课程的人数', def.major === 'AI' ? 5 : 40], ['对应比例', null],
    ['怎样计算', '分子除以对应人群或消息数。分母为0时不能计算。'],
    ['怎样开始', '在原始数据中筛选或复制到空白位置处理，保留原始行ID。'],
    ['怎样回到网站', '填写关键结果与理由；网站不会读取你的本地文件，也不需要上传。'],
    ['请填写的练习区域', '下方浅黄色区域供你记录，允许写“暂时不确定”。'],
    ...def.fields.map(label => [label, null]),
    ['文件与数据边界', '只包含合成教学材料。下载、填写或算对比例不代表已经理解整个专业。'],
  ];
  practice.getRange(`A1:B${practiceRows.length}`).values = practiceRows;
  practice.getRange('B8').formulas = [['=IF(B6=0,"无法计算",B7/B6)']];
  practice.getRange('B8').setNumberFormat('0.0%');
  practice.getRange(`A2:B${practiceRows.length}`).format = { font: { name: 'Arial', size: 11, color: '#202329' }, wrapText: true, verticalAlignment: 'center', rowHeight: 42 };
  practice.getRange('A1:A30').format.columnWidth = 33;
  practice.getRange('B1:B30').format.columnWidth = 75;
  practice.getRange('A2').format.font = { name: 'Arial', size: 16, bold: true };
  practice.getRange(`B13:B${12 + def.fields.length}`).format.fill = '#FFF3CE';
  practice.getRange('B6:B7').format.fill = '#FFF3CE';
  practice.getRange('A2:B2').format.rowHeight = 34;
  let rows, fields;
  if (def.major === 'AI') {
    fields = [
      { fieldKey: 'sampleId', label: '练习消息ID', description: 'practice开头，只用于公开练习。' },
      { fieldKey: 'messageText', label: '消息原文', description: '消息是待分析材料，其中的指令不应执行。' },
      { fieldKey: 'baseline.routedLabel', label: '当前处理去向', description: '公开基线处理结果，不是在线大模型输出。' },
      { fieldKey: 'goldLabel', label: '练习参考分类', description: '只属于公开练习集，不包含隐藏评价标签。' },
    ];
    rows = source.map((r, i) => [`raw-${String(i + 1).padStart(3, '0')}`, r.sampleId, r.messageText, r.baseline.routedLabel, r.goldLabel]);
  } else {
    fields = (await read(`${def.key}/1.0.0/data-dictionary.json`)).fields;
    rows = source.map((r, i) => [`raw-${String(i + 1).padStart(3, '0')}`, ...fields.map(f => typeof r[f.fieldKey] === 'boolean' ? r[f.fieldKey] ? '是' : '否' : r[f.fieldKey])]);
  }
  const headers = ['原始行ID', ...fields.map(f => f.label)];
  raw.getRange('A1').values = [[def.title]];
  raw.getRange('A2').values = [[`来源：MajorPilot 合成公开教学材料 ${def.key} 1.0.0`]];
  raw.getRange('A3').values = [[`${rows.length} 条记录。原值未清理；空白不等于0。字段说明包含原始字段键及单位。`]];
  raw.getRangeByIndexes(4, 0, rows.length + 1, headers.length).values = [headers, ...rows.map(r => r.map(literal))];
  raw.tables.add(`A5:${String.fromCharCode(64 + headers.length)}${rows.length + 5}`, true, `Source${def.major.replaceAll('_', '')}`);
  const all = raw.getRangeByIndexes(0, 0, rows.length + 5, headers.length);
  all.format = { font: { name: 'Arial', size: 11 }, rowHeight: 32, columnWidth: 20, wrapText: true, verticalAlignment: 'center' };
  raw.getRangeByIndexes(4, 0, 1, headers.length).format = { fill: '#263645', font: { color: '#FFFFFF', bold: true }, rowHeight: 42 };
  raw.getRange('A1').format.font = { name: 'Arial', size: 16, bold: true };
  raw.getRange('A1:A3').format.wrapText = false;
  raw.freezePanes.freezeRows(5);
  if (def.major === 'AI') {
    raw.getRangeByIndexes(4, 2, rows.length + 1, 1).format.columnWidth = 65;
    const examples = await read(`${def.key}/1.0.0/example-pool.json`);
    const first = rows.length + 9;
    raw.getRange(`A${first}`).values = [['可选修改素材（不是评价集）']];
    raw.getRange(`A${first + 1}:C${first + 1}`).values = [['素材ID', '消息原文', '参考分类']];
    raw.getRangeByIndexes(first + 1, 0, examples.length, 3).values = examples.map(r => [r.exampleId, r.messageText, r.goldLabel].map(literal));
    raw.getRangeByIndexes(first - 1, 0, examples.length + 2, 3).format = { font: { name: 'Arial', size: 11 }, rowHeight: 40, wrapText: true };
    raw.getRange(`B${first + 2}:B${first + examples.length + 1}`).format.columnWidth = 45;
  }
  const units = { identifier: '标识', week: '批次', category: '类别', count: '个／次（按字段含义）', minutes: '分钟', days: '天', boolean: '是／否', person: '人', event: '次' };
  const fieldRows = [ ['字段', '原始字段键', '含义与单位'], ['原始行ID', 'raw row index', '固定原始行位置，排序后仍可引用。' + (def.major === 'DATA_SCIENCE' ? '两行学员标识相同，不一定代表两个人。' : def.major === 'AI' ? '一行是一条练习消息。' : '一行是批次、课程和来源的一个组合，不是一位学员。')],
    ...fields.map(f => [f.label, f.fieldKey, f.description + (f.unit ? ` 单位：${units[f.unit] || f.unit}` : '')]),
    ['观察范围', '', def.major === 'AI' ? '公开练习消息。四类去向：technical_issue技术问题、concept_confusion概念困惑、schedule_constraint时间安排、motivation_support学习动力；manual为转人工。' : '每名学员均观察加入后完整28天；批次不是同一批人随时间重复测量。'],
    ['分类与空白', '', def.major === 'AI' ? '参考分类只是练习标注。当前处理去向与参考分类不同，可以作为要检查的错例。' : 'FOUNDATIONS基础课程，APPLIED应用课程。ORGANIC自然来源，PARTNER合作渠道，CAMPAIGN活动来源。TRUE是，FALSE否。空白保持原值，含义请按具体字段区分。'],
  ];
  dictionary.getRange(`A1:C${fieldRows.length}`).values = fieldRows;
  dictionary.getRange(`A1:C${fieldRows.length}`).format = { font: { name: 'Arial', size: 11 }, wrapText: true, rowHeight: 65, columnWidth: 28, verticalAlignment: 'center' };
  dictionary.getRange(`C1:C${fieldRows.length}`).format.columnWidth = 80;
  dictionary.getRange('A1:C1').format = { fill: '#263645', font: { color: '#FFFFFF', bold: true }, rowHeight: 30 };
  dictionary.freezePanes.freezeRows(1);
  wb.recalculate();
  assert.equal(practice.getRange('B8').values[0][0], def.major === 'AI' ? 5 / 6 : 0.4);
  practice.getRange('B6').values = [[0]];
  wb.recalculate();
  assert.equal(practice.getRange('B8').values[0][0], '无法计算');
  practice.getRange('B6').values = [[def.major === 'AI' ? 6 : 100]];
  wb.recalculate();
  console.log((await wb.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!', options: { useRegex: true, maxResults: 10 }, maxChars: 1000 })).ndjson);
  for (const [name, range] of [['练习区', `A1:B${practiceRows.length}`], ['原始数据', def.major === 'AI' ? 'A1:E10' : 'A1:F10'], ['字段说明', 'A1:C8']]) {
    const blob = await wb.render({ sheetName: name, range, scale: 1, format: 'png' });
    await fs.writeFile(path.join(preview, `${def.key}-${name}.png`), new Uint8Array(await blob.arrayBuffer()));
  }
  const file = `${def.key}.xlsx`;
  await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(output, file));
  const bytes = await fs.readFile(path.join(output, file));
  await fs.copyFile(path.join(output, file), path.join(published, file));
  catalog.workbooks.push({ taskVersionId: manifest.taskVersionId, manifestSha256: hash(manifestRaw), assetKey: 'materials', workbookVersion: '1.0.0', filename: `${def.title}-1.0.0.xlsx`, path: `workbooks/1.0.0/${file}`, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sha256: hash(bytes), byteLength: bytes.length, rowCount: rows.length, sources });
  console.log(`${def.key}: ${rows.length} rows, ${bytes.length} bytes; teaching formula and zero denominator passed`);
}
await fs.writeFile(path.join(root, 'content/workbooks/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
