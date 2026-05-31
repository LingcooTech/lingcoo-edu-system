import { PageFrame } from '@/components/layout/PageFrame';
import { ComingSoon } from '@/components/shared/ComingSoon';

export function AttendancePage() {
  return (
    <PageFrame section="attendance">
      <ComingSoon
        summary="签到消课是课次发生后的核心动作：按课次逐个学员签到，按状态扣减课时并写入课时流水。"
        points={[
          '课次签到状态：到课 / 请假 / 缺勤 / 补课 / 试听（业务逻辑 §6.4）',
          '到课扣课时，请假 / 缺勤按机构规则；扣课时即写课时流水、更新余额',
          '同一课次 + 同一学员签到幂等，不重复扣；余额低于阈值生成续费提醒',
        ]}
        deliveredBy="POST attendance 接口已存在，签到 UI 由后续步骤交付；本期签到由管理员在后台操作。"
      />
    </PageFrame>
  );
}
