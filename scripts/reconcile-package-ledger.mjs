import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new pg.Pool({ connectionString, max: 1 });

const checks = [
  {
    name: 'package_balance_mismatch',
    sql: `
      SELECT cc.id AS course_contract_id, cc.student_id, cc.contract_no,
        cc.remaining_lesson_count AS stored_balance,
        COALESCE(SUM(lm.units), 0)::integer AS ledger_balance
      FROM course_contracts cc
      LEFT JOIN lesson_movements lm ON lm.course_contract_id = cc.id
      GROUP BY cc.id
      HAVING cc.remaining_lesson_count <> COALESCE(SUM(lm.units), 0)
      ORDER BY cc.created_at, cc.id
    `,
  },
  {
    name: 'deducted_attendance_without_package',
    sql: `
      SELECT ar.id AS attendance_record_id, ar.student_id, ar.class_session_id, ar.lesson_delta
      FROM attendance_records ar
      WHERE ar.lesson_delta < 0 AND ar.course_contract_id IS NULL
      ORDER BY ar.created_at, ar.id
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
      ORDER BY ar.created_at, ar.id
    `,
  },
  {
    name: 'attendance_net_movement_mismatch',
    sql: `
      SELECT ar.id AS attendance_record_id, ar.student_id, ar.course_contract_id,
        ar.lesson_delta, COALESCE(SUM(lm.units), 0)::integer AS movement_units
      FROM attendance_records ar
      LEFT JOIN lesson_movements lm ON lm.attendance_record_id = ar.id
      GROUP BY ar.id
      HAVING ar.lesson_delta <> COALESCE(SUM(lm.units), 0)
      ORDER BY ar.created_at, ar.id
    `,
  },
  {
    name: 'movement_ownership_mismatch',
    sql: `
      SELECT lm.id AS movement_id, lm.student_id AS movement_student_id,
        lm.course_contract_id, cc.student_id AS package_student_id
      FROM lesson_movements lm
      INNER JOIN course_contracts cc ON cc.id = lm.course_contract_id
      WHERE lm.student_id <> cc.student_id
      ORDER BY lm.created_at, lm.id
    `,
  },
];

let issueCount = 0;
try {
  await pool.query('BEGIN READ ONLY');
  for (const check of checks) {
    const result = await pool.query(check.sql);
    issueCount += result.rowCount ?? 0;
    process.stdout.write(`${check.name}: ${result.rowCount ?? 0}\n`);
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

if (issueCount > 0) {
  process.exitCode = 2;
}
