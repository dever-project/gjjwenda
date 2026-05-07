import type { DynamicApp, DynamicAppDefinition, DynamicAppMetric } from '@/lib/appTypes';
import {
  mapFeishuFieldToDynamicField,
  pickPrimaryField,
  pickTableFieldKeys,
} from '@/lib/dynamic-apps/fieldMapping';
import {
  type FeishuBitableTable,
  parseFeishuBitableUrl,
  readFeishuBitableFields,
  readFeishuBitableTables,
  searchFeishuBitableRecords,
} from '@/lib/server/feishuClient';
import type { FeishuCredentials } from '@/lib/server/feishuRepository';

interface BuildDynamicAppInput {
  sourceUrl: string;
  description?: string;
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compactText(value?: string) {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function buildAppName(tableName: string, description?: string) {
  const text = compactText(description);
  if (!text) {
    return `${tableName} 应用`;
  }

  const firstSentence = text.split(/[。.!！?\n]/)[0]?.trim();
  return firstSentence && firstSentence.length <= 18 ? firstSentence : `${tableName} 应用`;
}

function buildMetrics(tableId: string, fieldKeys: string[]): DynamicAppMetric[] {
  const metrics: DynamicAppMetric[] = [
    {
      id: 'metric_total',
      title: '记录总数',
      type: 'count',
      tableId,
    },
  ];

  const firstFieldKey = fieldKeys[0];
  if (firstFieldKey) {
    metrics.push({
      id: 'metric_filled_primary',
      title: `${firstFieldKey} 完整度`,
      type: 'filled',
      tableId,
      fieldKey: firstFieldKey,
    });
  }

  return metrics;
}

function isApiTableId(tableId?: string) {
  return Boolean(tableId?.startsWith('tbl'));
}

function selectBitableTable(tables: FeishuBitableTable[], requestedTableId?: string) {
  const matchedTable = requestedTableId
    ? tables.find((table) => table.tableId === requestedTableId)
    : undefined;
  if (matchedTable) {
    return matchedTable;
  }

  if (tables[0]) {
    return tables[0];
  }

  if (isApiTableId(requestedTableId)) {
    return {
      tableId: requestedTableId!,
      name: '飞书数据表',
    };
  }

  return undefined;
}

export async function buildDynamicAppFromFeishu(
  credentials: FeishuCredentials,
  input: BuildDynamicAppInput
): Promise<DynamicApp> {
  const source = parseFeishuBitableUrl(input.sourceUrl);
  let tables: FeishuBitableTable[] = [];
  try {
    tables = await readFeishuBitableTables(credentials, source.appToken);
  } catch (error) {
    if (!source.tableId) {
      throw error;
    }
  }

  const selectedTable = selectBitableTable(tables, source.tableId);

  if (!selectedTable) {
    throw new Error('未找到可生成应用的数据表，请检查飞书多维表格权限，或在 URL 中使用真实 table_id');
  }

  const rawFields = await readFeishuBitableFields(credentials, source.appToken, selectedTable.tableId);
  const fields = rawFields.map(mapFeishuFieldToDynamicField);
  if (fields.length === 0) {
    throw new Error('该多维表格没有可识别字段，无法生成应用');
  }

  const fieldKeys = pickTableFieldKeys(fields);
  let sampleRecordCount = 0;
  try {
    const samplePage = await searchFeishuBitableRecords(credentials, {
      appToken: source.appToken,
      tableId: selectedTable.tableId,
      viewId: source.viewId,
      pageSize: 20,
      fieldNames: fieldKeys,
    });
    sampleRecordCount = samplePage.records.length;
  } catch {
    // 样例记录只用于预估记录数，字段元数据可用时不阻断应用生成。
    sampleRecordCount = 0;
  }

  const appName = buildAppName(selectedTable.name, input.description);
  const description =
    compactText(input.description) ||
    `由飞书多维表格「${selectedTable.name}」自动生成的系统内部应用。`;
  const tableId = selectedTable.tableId;
  const definition: DynamicAppDefinition = {
    version: 1,
    name: appName,
    description,
    sourceUrl: input.sourceUrl,
    generatedAt: Date.now(),
    tables: [
      {
        id: tableId,
        name: selectedTable.name,
        source: {
          type: 'feishu_bitable',
          sourceUrl: input.sourceUrl,
          appToken: source.appToken,
          tableId,
          viewId: source.viewId,
        },
        fields,
        primaryFieldKey: pickPrimaryField(fields),
        sampleRecordCount,
      },
    ],
    views: [
      {
        id: 'view_table',
        name: `${selectedTable.name} 列表`,
        type: 'table',
        tableId,
        fieldKeys,
      },
      {
        id: 'view_dashboard',
        name: '数据概览',
        type: 'dashboard',
        tableId,
        metrics: buildMetrics(tableId, fieldKeys),
      },
    ],
  };

  return {
    id: createId('app'),
    name: appName,
    description,
    sourceUrl: input.sourceUrl,
    schemaPreview: definition,
    createdAt: Date.now(),
  };
}
