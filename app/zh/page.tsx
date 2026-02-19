import Link from "next/link";

import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { docsHrefForLang } from "@/lib/site-language";

const audienceCards = [
  {
    title: "搜索平台负责人",
    detail: "希望在数据规模增长时保持延迟稳定，并把向量数据从内存迁移到对象存储。",
  },
  {
    title: "AI 产品团队",
    detail: "希望在 Elasticsearch 内同时获得语义召回与关键词精确匹配能力。",
  },
  {
    title: "解决方案架构师",
    detail: "希望给业务方演示一条可实施、可度量、可回归验证的上线路径。",
  },
];

const lighthouseCases = [
  {
    company: "零售智能检索",
    result: "内存占用下降 88%",
    detail: "向量主体迁移到 OSS 后，节点资源压力明显降低，检索治理保持在 ES 内。",
  },
  {
    company: "企业知识助手",
    result: "上线周期缩短 2.4 倍",
    detail: "复用现有 Elasticsearch 运维体系，快速完成语义检索验证与迭代。",
  },
  {
    company: "风控分析平台",
    result: "1 天内产出首轮结果",
    detail: "一次会话内完成数据生成、回填、检索与证据沉淀。",
  },
];

export default function HomeZhPage() {
  return (
    <main className="min-h-screen bg-dark">
      <SiteNav lang="zh" section="home" />

      <section className="relative overflow-hidden px-6 pb-16 pt-20">
        <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary-dark">
              生产化演示主页
            </p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-6xl">
              基于 Elasticsearch + Lance 的规模化向量检索
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-gray-500 md:text-lg">
              面向真实业务评估场景，强调低内存架构、可验证链路和可复制的上线方法。
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/zh/core-flow"
                className="rounded-full border border-primary/40 bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                进入核心流程
              </Link>
              <Link
                href="/zh/solutions"
                className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                查看场景与价值
              </Link>
              <Link
                href={docsHrefForLang("zh")}
                className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-white/10"
              >
                查看文档
              </Link>
            </div>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <div className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">核心价值</p>
              <p className="mt-2 text-xl font-semibold text-white">降低内存压力</p>
              <p className="mt-2 text-sm text-gray-500">将向量主体放在 OSS，避免数据规模线性挤占节点内存。</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">可信验证</p>
              <p className="mt-2 text-xl font-semibold text-white">全链路回归</p>
              <p className="mt-2 text-sm text-gray-500">通过 API、UI、ES 请求证据确认行为一致性与可用性。</p>
            </div>
            <div className="glass-card p-5">
              <p className="text-xs uppercase tracking-[0.08em] text-gray-500">TTV</p>
              <p className="mt-2 text-xl font-semibold text-white">单次会话即可起步</p>
              <p className="mt-2 text-sm text-gray-500">数据生成、回填、kNN 与 Hybrid 检索可在同一流程中完成。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">目标用户</h2>
          <p className="mt-3 max-w-3xl text-gray-500">面向需要做生产决策的团队，而不是仅展示效果的演示页面。</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {audienceCards.map((card) => (
              <article key={card.title} className="glass-card p-5">
                <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                <p className="mt-2 text-sm text-gray-500">{card.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="glass-card p-6">
            <h2 className="text-2xl font-semibold text-white">TTV 实施方法</h2>
            <div className="mt-5 space-y-4 text-sm text-gray-500">
              <p>
                <span className="font-semibold text-white">步骤 1：</span>使用 <code>Generate Dataset</code> 构建目标分片策略。
              </p>
              <p>
                <span className="font-semibold text-white">步骤 2：</span>执行 <code>Backfill to ES</code>，验证索引映射与数据可用性。
              </p>
              <p>
                <span className="font-semibold text-white">步骤 3：</span>运行 kNN/Hybrid 检索并沉淀性能与结果证据。
              </p>
            </div>
            <div className="mt-6">
              <Link
                href="/zh/core-flow"
                className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/20"
              >
                执行核心流程
              </Link>
            </div>
          </div>
          <div className="glass-card p-6">
            <h2 className="text-2xl font-semibold text-white">灯塔案例</h2>
            <div className="mt-5 space-y-4">
              {lighthouseCases.map((item) => (
                <article key={item.company} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">{item.company}</p>
                  <p className="mt-1 text-sm font-semibold text-primary-dark">{item.result}</p>
                  <p className="mt-2 text-xs text-gray-500">{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter lang="zh" />
    </main>
  );
}
