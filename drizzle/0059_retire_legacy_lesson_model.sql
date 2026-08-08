DO $$
DECLARE
  target_student_id constant uuid := '9e8aad53-75db-4f6a-904a-d58e7dfad79d';
  target_contract_id constant uuid := '3d736df0-4006-4dc7-bbae-bec9cdfe5aa1';
  target_operation_id constant text :=
    'reconciliation:0059:3d736df0-4006-4dc7-bbae-bec9cdfe5aa1:attendance-balance';
  contract_row course_contracts%ROWTYPE;
  movement_id uuid;
  ledger_balance integer;
  attendance_count integer;
  deducted_units integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM lesson_movements WHERE operation_id = target_operation_id
  ) THEN
    SELECT * INTO contract_row
    FROM course_contracts
    WHERE id = target_contract_id AND student_id = target_student_id;
    IF NOT FOUND OR contract_row.remaining_lesson_count <> 15 THEN
      RAISE EXCEPTION '0059 reconciliation already exists but target balance is not 15';
    END IF;
    RETURN;
  END IF;

  SELECT * INTO contract_row
  FROM course_contracts
  WHERE id = target_contract_id AND student_id = target_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM students
      WHERE id = target_student_id OR name = '公绪慷'
    ) THEN
      RAISE EXCEPTION '0059 target student exists but the expected package does not match';
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM students
    WHERE id = target_student_id AND name = '公绪慷'
  ) THEN
    RAISE EXCEPTION '0059 target student identity does not match';
  END IF;

  SELECT COALESCE(SUM(units), 0)::integer INTO ledger_balance
  FROM lesson_movements
  WHERE course_contract_id = target_contract_id;

  SELECT COUNT(*)::integer, COALESCE(SUM(-lesson_delta), 0)::integer
  INTO attendance_count, deducted_units
  FROM attendance_records
  WHERE student_id = target_student_id
    AND course_contract_id = target_contract_id
    AND lesson_delta < 0;

  IF contract_row.lesson_count <> 20
    OR contract_row.remaining_lesson_count <> 20
    OR ledger_balance <> 20
    OR attendance_count <> 5
    OR deducted_units <> 5 THEN
    RAISE EXCEPTION
      '0059 precondition failed: total %, balance %, ledger %, attendance %, deducted %',
      contract_row.lesson_count,
      contract_row.remaining_lesson_count,
      ledger_balance,
      attendance_count,
      deducted_units;
  END IF;

  UPDATE course_contracts
  SET remaining_lesson_count = 15, updated_at = now()
  WHERE id = target_contract_id;

  INSERT INTO lesson_movements (
    course_contract_id,
    student_id,
    operation_id,
    type,
    units,
    balance_before,
    balance_after,
    occurred_at,
    reason,
    metadata
  ) VALUES (
    target_contract_id,
    target_student_id,
    target_operation_id,
    'adjustment',
    -5,
    20,
    15,
    now(),
    '按现存签到记录校准课时包余额：20课时减5次扣课',
    jsonb_build_object(
      'migration', '0059_retire_legacy_lesson_model',
      'studentName', '公绪慷',
      'packageLessonCount', 20,
      'deductedAttendanceCount', 5,
      'balanceBefore', 20,
      'balanceAfter', 15
    )
  )
  RETURNING id INTO movement_id;

  INSERT INTO audit_logs (
    institution_id,
    action,
    resource_type,
    resource_id,
    summary,
    meta
  ) VALUES (
    contract_row.institution_id,
    'lesson.movement.adjustment',
    'lesson_movement',
    movement_id::text,
    '按签到记录校准公绪慷课时包余额',
    jsonb_build_object(
      'operationId', target_operation_id,
      'courseContractId', target_contract_id,
      'studentId', target_student_id,
      'units', -5,
      'balanceBefore', 20,
      'balanceAfter', 15,
      'reason', '20课时包已有5条扣课签到'
    )
  );
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "lesson_transactions";
--> statement-breakpoint
DROP TABLE IF EXISTS "lesson_accounts";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."lesson_transaction_type";
