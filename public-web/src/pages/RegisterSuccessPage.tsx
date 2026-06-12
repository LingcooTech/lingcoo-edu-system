import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

import { Layout } from '@/components/Layout';
import { useSeo } from '@/lib/seo';

export function RegisterSuccessPage() {
  useSeo({
    title: '预约成功',
    description: '预约信息已提交，老师会尽快联系确认上课时间。',
  });

  return (
    <Layout>
      <section className="container-narrow py-12">
        <div className="pwcard flex flex-col items-center p-8 text-center">
          <CheckCircle2 className="text-brand h-12 w-12" />
          <h1 className="text-ink mt-4 text-xl font-bold">预约成功</h1>
          <p className="text-ink-soft mt-2 text-sm leading-6">
            我们已收到您的预约，老师会尽快电话联系您确认上课时间，请保持手机畅通。
          </p>
          <div className="mt-6 flex w-full flex-col gap-2">
            <Link to="/courses" className="pwbtn pwbtn-primary w-full">
              继续浏览课程
            </Link>
            <Link to="/" className="pwbtn pwbtn-outline w-full">
              返回首页
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
