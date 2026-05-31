import { PageFrame } from '@/components/layout/PageFrame';
import { ComingSoon } from '@/components/shared/ComingSoon';

export function ReportsPage() {
  return (
    <PageFrame section="reports">
      <ComingSoon
        summary="经营报表把招生漏斗、收入与课消等关键指标集中到一处，支撑按渠道 / 活动复盘投放 ROI。"
        points={[
          '转化漏斗：线索 → 已联系 → 到店试听 → 成交，按渠道 / 活动拆分（业务逻辑 §4.2 归因链）',
          '收入报表：订单收款、客单价、续费率',
          '课消报表：课时消耗、低余额预警与续费提醒（业务逻辑 §6.4）',
        ]}
        deliveredBy="转化漏斗目前仍在「渠道活动」页，后续步骤迁入此处；其余报表为后端后续步骤交付。"
      />
    </PageFrame>
  );
}
