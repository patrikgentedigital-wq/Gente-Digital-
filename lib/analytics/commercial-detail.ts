export type CommercialDateOrder = 'ascending' | 'descending';

export function sortCommercialRecordsByDate<Row extends { date: string }>(
  records: readonly Row[],
  order: CommercialDateOrder,
): Row[] {
  return [...records].sort((first, second) => order === 'ascending'
    ? first.date.localeCompare(second.date)
    : second.date.localeCompare(first.date));
}
