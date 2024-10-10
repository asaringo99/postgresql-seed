import { Client } from 'pg';
import { faker } from '@faker-js/faker';

// PostgreSQLクライアントの設定
const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'my_db',  // データベース名を指定
  password: 'secret',
  port: 5432,
});

type Rule = {
  table: string,
  column: string,
  value: any,
}

type Edge = {
  childTable: string,
  parentTableColumn: string,
  childTableColumn: string,
}

// データ型に基づいて適切なランダム値を生成する関数
function generateValueForDataType(dataType: string): any {
  switch (dataType) {
    case 'smallint':
      return faker.number.int({ min: -32768, max: 32767 });  // smallintの範囲
    case 'integer':
      return faker.number.int({ min: -2147483648, max: 2147483647 });  // integerの範囲
    case 'bigint':
      return faker.number.bigInt({ min: BigInt('-9223372036854775808'), max: BigInt('9223372036854775807') });  // bigintの範囲
    case 'numeric':
    case 'decimal':
      return faker.number.float({ min: 0, max: 10000 });  // 小数を生成
    case 'text':
    case 'varchar':
    case 'character varying':  // varchar, character varying に対応
      return faker.string.alphanumeric(10);  // ランダムな文字列を生成
    case 'boolean':
      return faker.datatype.boolean();  // 真偽値を生成
    case 'date':
    case 'timestamp':
      return faker.date.past();
    case 'timestamp without time zone':  // タイムゾーンなしのtimestamp対応
      return faker.date.recent().toISOString().replace('T', ' ').split('.')[0];  // ISO形式からタイムゾーン部分を取り除く
    case 'uuid':
      return faker.string.uuid();  // UUIDを生成
    default:
      return faker.string.alphanumeric(10);  // デフォルトで文字列を生成
  }
}
// テーブルの列情報を取得する関数（カラム名とデータ型を取得）
async function getTableColumns(tableName: string): Promise<{ columnName: string, dataType: string }[]> {
  const query = `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = $1
  `;
  const res = await client.query(query, [tableName]);
  return res.rows.map((row) => ({
    columnName: row.column_name,
    dataType: row.data_type,
  }));
}

// 外部キー制約を取得する関数（子テーブル→親テーブルの有向辺）
async function getForeignKeys(tableName: string): Promise<{ parentTable: string, parentColumn: string, childColumn: string }[]> {
  const query = `
    SELECT
      ccu.table_name AS parent_table,
      ccu.column_name AS parent_column,
      kcu.column_name AS child_column
    FROM
      information_schema.key_column_usage AS kcu
    JOIN
      information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = kcu.constraint_name
    WHERE kcu.table_name = $1
  `;
  const res = await client.query(query, [tableName]);
  return res.rows.filter((row) => row.parent_table !== tableName).map(row => ({
    parentTable: row.parent_table,
    parentColumn: row.parent_column,
    childColumn: row.child_column,
  }));
}

async function insertIntoTable(
  tableName: string,
  foreignKeyValues: { [key: string]: string },
  rules?: Map<string, Omit<Rule, "table">[]>
): Promise<{[key: string]: string}> {
  const keyValueStore: {[key: string]: string} = {};
  const columns = await getTableColumns(tableName);  // テーブルのすべての列を取得
  const insertColumns: string[] = [];
  const insertValues: any[] = [];
  const rule = rules?.get(tableName) ?? [];

  for (const { columnName, dataType } of columns) {
    let columnValue;
    if (rule.some((r) => r.column === columnName)) {
      columnValue = rule.find((r) => r.column === columnName)?.value;
    }
    else if (foreignKeyValues[columnName]) {
      columnValue = foreignKeyValues[columnName];
    } else {
      // データ型に基づいて適切な値を生成
      columnValue = generateValueForDataType(dataType);
    }
    insertColumns.push(columnName);
    insertValues.push(columnValue)
    keyValueStore[columnName] = columnValue
  }

  const query = `
    INSERT INTO ${tableName} (${insertColumns.join(', ')})
    VALUES (${insertValues.map((_, i) => `$${i + 1}`).join(', ')});
  `;

  await client.query(query, insertValues);
  console.log(`Inserted into ${tableName}`);

  return keyValueStore;
}

// トポロジカルソート用に依存関係グラフを構築する関数
async function buildDependencyGraph(targetTables: string[], rules?: Rule[]) {
  const graph = new Map<string, Edge[]>();  // 親テーブル -> 子テーブル
  const indegree = new Map<string, number>();  // 各テーブルのインディグリ（入ってくる辺の数）
  const isUsedTable = new Set<string>();

  const insertRules = new Map<string, Omit<Rule, "table">[]>()

  if (rules) {
    for(const { table, column, value } of rules) {
      if (!insertRules.has(table)) {
        insertRules.set(table,[]);
      }
      insertRules.get(table)!.push({
        column: column,
        value: value
      })
    }
  }

  async function dfs(table: string) {
    if (isUsedTable.has(table)) {
      return;
    }
    isUsedTable.add(table);
    if (!indegree.has(table)) {
      indegree.set(table, 0);
    }
    if (!graph.has(table)) {
      graph.set(table, []);
    }
    const foreignKeys = await getForeignKeys(table);
    for (const { parentTable, parentColumn, childColumn } of foreignKeys) {
      const isInRule = Array.from(insertRules).some(([t, v]) => t === table  && v.some((r) => r.column === childColumn));
      if (isInRule) {
        const overrideValue = insertRules.get(table)!.find((r) => r.column === childColumn)?.value
        const s = insertRules.get(table)!.filter((r) => r.column !== childColumn);
        insertRules.delete(table);
        insertRules.set(table, s);
        if (!insertRules.has(parentTable)) {
          insertRules.set(parentTable, []);
        }
        if (insertRules.get(parentTable)?.every((r) => r.column !== parentColumn)) {
          insertRules.get(parentTable)!.push({ column: parentColumn, value: overrideValue});
        }
      }
      // 親テーブル -> 子テーブル の関係でグラフを作る
      if (!graph.has(parentTable)) {
        graph.set(parentTable, []);
      }
      graph.get(parentTable)!.push({
        childTable: table,
        parentTableColumn: parentColumn,
        childTableColumn: childColumn,
      });  // 親から子に辺を張る
      indegree.set(table, (indegree.get(table) || 0) + 1);  // 子テーブルのインディグリを増やす
      await dfs(parentTable);
    }
  }

  for (const table of targetTables) {
    await dfs(table);
  }

  return function () {
    return {
      graph: graph,
      indegree: indegree,
      insertRules: insertRules,
    }
  }
}

async function insertDataWithTopologicalSort(
  targetTables: string[],
  rules?: Rule[],
) {
  // グラフを構築
  const getGraphInfo = await buildDependencyGraph(
    targetTables,
    rules,
  );
  const graphInfo = getGraphInfo();
  const {graph, indegree, insertRules} = graphInfo;
  console.log("Dependency Graph:", graph);
  console.log("In-degree Map:", indegree);
  console.log("insertRules:", insertRules);

  const foreignConstraints: Map<string,{[key: string]: string}> = new Map();
  const queue: string[] = [];
  for (const [table, deg] of indegree.entries()) {
    if (deg !== 0) {
      continue
    }
    queue.push(table);
  }
  while(queue.length !== 0) {
    const current = queue.shift()!;
    if (!foreignConstraints.has(current)) {
      foreignConstraints.set(current,{});
    }
    const currentConstraints = foreignConstraints.get(current)!
    const keyValueStore = await insertIntoTable(current, currentConstraints, insertRules)

    const edges = graph.get(current) ?? [];
    const nodesInfo = new Map<string, {parentColumn: string, childColumn: string}[]>();
    for (const edge of edges){
      if (!nodesInfo.has(edge.childTable)) {
        nodesInfo.set(edge.childTable,[])
      }
      nodesInfo.get(edge.childTable)!.push({
        parentColumn: edge.parentTableColumn,
        childColumn: edge.childTableColumn
      });
    }
    for (const [child, columns] of nodesInfo) {
      if (!foreignConstraints.has(child)) {
        foreignConstraints.set(child, {});
      }
      const childConstraint = foreignConstraints.get(child)!
      for (const column of columns) {
        childConstraint[column.childColumn] = keyValueStore[column.parentColumn]
      }
      foreignConstraints.set(child,childConstraint);
      indegree.set(child, (indegree.get(child) || 0) - 1);
      if (indegree.get(child) === 0) {
        queue.push(child);
      }
    }
  }
}


// メインの処理
(async () => {
  try {
    // PostgreSQLに接続
    await client.connect();

    // データを挿入したいターゲットテーブルを指定
    const targetTables = ['payments', 'supplier_products', 'order_items'];
    const rules = [
      {table: "payments", column: "order_id", value: "11"},
      {table: "supplier_products", column: "supplier_id", value: "5"},
    ]

    // グラフを構築
    await insertDataWithTopologicalSort(
      targetTables,
      rules
    );

  } catch (err) {
    console.error('Error running script:', err);
  } finally {
    await client.end();
  }
})();
