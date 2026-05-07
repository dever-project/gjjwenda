import type { DynamicAppField, DynamicFieldOption, DynamicFieldType } from '@/lib/appTypes';

type FeishuField = Record<string, unknown>;

const FIELD_TYPE_BY_CODE: Record<string, DynamicFieldType> = {
  '1': 'text',
  '2': 'number',
  '3': 'select',
  '4': 'multiSelect',
  '5': 'date',
  '7': 'boolean',
  '11': 'user',
  '13': 'text',
  '15': 'url',
  '17': 'attachment',
  '18': 'unknown',
  '19': 'unknown',
  '20': 'date',
  '21': 'date',
};

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRawType(field: FeishuField) {
  return stringValue(field.ui_type) || String(field.type ?? '').trim();
}

function inferFieldType(field: FeishuField): DynamicFieldType {
  const rawType = normalizeRawType(field).toLowerCase();
  const mappedByCode = FIELD_TYPE_BY_CODE[rawType];
  if (mappedByCode) {
    return mappedByCode;
  }

  if (rawType.includes('number') || rawType.includes('currency') || rawType.includes('rating')) {
    return 'number';
  }
  if (rawType.includes('date') || rawType.includes('time')) {
    return 'date';
  }
  if (rawType.includes('checkbox') || rawType.includes('boolean')) {
    return 'boolean';
  }
  if (rawType.includes('multi') || rawType.includes('multiple')) {
    return 'multiSelect';
  }
  if (rawType.includes('select') || rawType.includes('option')) {
    return 'select';
  }
  if (rawType.includes('user') || rawType.includes('person')) {
    return 'user';
  }
  if (rawType.includes('url') || rawType.includes('link')) {
    return 'url';
  }
  if (rawType.includes('attachment') || rawType.includes('file')) {
    return 'attachment';
  }

  return rawType ? 'text' : 'unknown';
}

function readFieldOptions(field: FeishuField): DynamicFieldOption[] | undefined {
  const property = field.property;
  if (!property || typeof property !== 'object') {
    return undefined;
  }

  const options = (property as Record<string, unknown>).options;
  if (!Array.isArray(options)) {
    return undefined;
  }

  return options
    .map((option) => {
      if (!option || typeof option !== 'object') {
        return undefined;
      }

      const optionRecord = option as Record<string, unknown>;
      const name = stringValue(optionRecord.name) || stringValue(optionRecord.text);
      if (!name) {
        return undefined;
      }

      return {
        id: stringValue(optionRecord.id) || undefined,
        name,
        color: stringValue(optionRecord.color) || undefined,
      };
    })
    .filter(Boolean) as DynamicFieldOption[];
}

export function mapFeishuFieldToDynamicField(field: FeishuField): DynamicAppField {
  const title = stringValue(field.field_name) || stringValue(field.name) || '未命名字段';
  const fieldId = stringValue(field.field_id) || title;
  const type = inferFieldType(field);

  return {
    fieldId,
    key: title,
    name: title,
    title,
    type,
    rawType: normalizeRawType(field) || undefined,
    visible: true,
    editable: type !== 'unknown',
    options: readFieldOptions(field),
  };
}

export function pickPrimaryField(fields: DynamicAppField[]) {
  return fields.find((field) => field.type === 'text')?.key ?? fields[0]?.key;
}

export function pickTableFieldKeys(fields: DynamicAppField[]) {
  const preferredTypes = new Set<DynamicFieldType>([
    'text',
    'select',
    'multiSelect',
    'number',
    'date',
    'boolean',
    'user',
    'url',
  ]);

  return fields
    .filter((field) => field.visible && preferredTypes.has(field.type))
    .slice(0, 10)
    .map((field) => field.key);
}
