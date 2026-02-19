import Link from "next/link";

import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { VectorManagement } from "@/features/vector-mgmt";
import { LiveDemo } from "@/features/live-demo";

export default function CoreFlowZhPage() {
  return (
    <main className="min-h-screen bg-dark">
      <SiteNav lang="zh" section="core-flow" />

      <section className="relative overflow-hidden px-6 pb-10 pt-16">
        <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl">
          <p className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary-dark">
            核心功能流程
          </p>
          <h1 className="mt-5 text-3xl font-semibold text-white md:text-5xl">生成数据集、回填索引、执行检索的一体化链路</h1>
          <p className="mt-4 max-w-3xl text-gray-500">
            本页用于核心能力验证：生成数据集、回填到 Elasticsearch，然后执行 kNN 与 Hybrid 检索并获取证据。
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="glass-card p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">阶段 01</p>
              <p className="mt-2 text-base font-semibold text-white">数据集构建</p>
              <p className="mt-1 text-sm text-gray-500">按目标分片策略生成并管理 Lance 数据集。</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">阶段 02</p>
              <p className="mt-2 text-base font-semibold text-white">索引激活</p>
              <p className="mt-1 text-sm text-gray-500">将数据回填到 ES，校验映射与查询路径。</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">阶段 03</p>
              <p className="mt-2 text-base font-semibold text-white">检索验证</p>
              <p className="mt-1 text-sm text-gray-500">执行 kNN 与 Hybrid 请求并输出性能与结果证据。</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="#vector-management"
              className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/20"
            >
              跳转到数据集管理
            </Link>
            <Link
              href="#live-demo"
              className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              跳转到检索演示
            </Link>
          </div>
        </div>
      </section>

      <VectorManagement />
      <LiveDemo />

      <section className="px-6 pb-4">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">需要对外叙事与销售素材？</h2>
            <p className="mt-2 text-sm text-gray-500">请前往“场景与价值”页面，查看用户画像、灯塔案例与 TTV 话术框架。</p>
            <Link
              href="/zh/solutions"
              className="mt-4 inline-flex rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/20"
            >
              打开场景与价值页
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter lang="zh" />
    </main>
  );
}
