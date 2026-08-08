import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new pg.Pool({ connectionString, max: 1 });

const checks = [
  {
    name: 'legacy_account_package_mismatch',
    sql: `
      SELECT la.student_id, la.course_id,
        la.balance AS legacy_balance,
        COALESCE(SUM(cc.remaining_lesson_count) FILTER (WHERE cc.status <> 'cancelled'), 0)::integer
          AS package_balance
      FROM lesson_accounts la
      LEFT JOIN course_contracts cc
        ON cc.student_id = la.student_id AND cc.course_id = la.course_id
      GROUP BY la.student_id, la.course_id, la.balance
      HAVING la.balance <> COALESCE(SUM(cc.remaining_lesson_count) FILTER (WHERE cc.status <> 'cancelled'), 0)
      ORDER BY la.student_id, la.course_id
    `,
  },
  {
    name: 'deducted_attendance_without_package',
    sql: `
      SELECT ar.id AS attendance_record_id, ar.student_id, ar.class_session_id,
        ar.lesson_delta, cs.starts_at, cs.course_id
      FROM attendance_records ar
      INNER JOIN class_sessions cs ON cs.id = ar.class_session_id
      WHERE ar.lesson_delta < 0 AND ar.course_contract_id IS NULL
      ORDER BY cs.starts_at, ar.id
    `,
  },
  {
    name: 'attendance_package_student_mismatch',
    sql: `
      SELECT ar.id AS attendance_record_id, ar.student_id AS attendance_student_id,
        ar.course_contract_id, cc.student_id AS package_student_id
      FROM attendance_records ar
      INNER JOIN course_contracts cc ON cc.id = ar.course_contract_id
      WHERE ar.student_id <> cc.student_id
      ORDER BY ar.id
    `,
  },
  {
    name: 'ambiguous_historical_package_candidates',
    sql: `
      SELECT ar.id AS attendance_record_id, ar.student_id, ar.class_session_id,
        count(cc.id)::integer AS candidate_count,
        array_agg(cc.id ORDER BY cc.created_at, cc.id) AS candidate_contract_ids
      FROM attendance_records ar
      INNER JOIN class_sessions cs ON cs.id = ar.class_session_id
      INNER JOIN course_contracts cc
        ON cc.student_id = ar.student_id
       AND cc.course_id = cs.course_id
       AND (cc.starts_at IS NULL OR cs.starts_at >= cc.starts_at)
       AND (cc.ends_at IS NULL OR cs.starts_at <= cc.ends_at)
       AND cc.status <> 'cancelled'
      WHERE ar.lesson_delta < 0 AND ar.course_contract_id IS NULL
      GROUP BY ar.id, ar.student_id, ar.class_session_id
      HAVING count(cc.id) <> 1
      ORDER BY ar.id
    `,
  },
];

let issueCount = 0;
try {
  await pool.query('BEGIN READ ONLY');
  for (const check of checks) {
    const result = await pool.query(check.sql);
    const count = result.rowCount ?? 0;
    issueCount += count;
    process.stdout.write(`${check.name}: ${count}\n`);
    if (result.rows.length > 0) {
      process.stdout.write(`${JSON.stringify(result.rows, null, 2)}\n`);
    }
  }
  await pool.query('ROLLBACK');
} catch (error) {
  await pool.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await pool.end();
}

if (issueCount > 0) process.exitCode = 2;
