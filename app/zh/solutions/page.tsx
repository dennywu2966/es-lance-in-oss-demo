import Link from "next/link";

import { SiteNav } from "@/components/site/site-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { PerformanceDashboard } from "@/components/performance-dashboard";

const segments = [
  {
    audience: "平台工程团队",
    scenario: "希望在保持 Elasticsearch 治理体系的前提下，减少向量检索的内存成本。",
    value: "成本结构更稳定，平台职责边界更清晰。",
  },
  {
    audience: "AI 应用团队",
    scenario: "需要关键词与语义召回协同，支持复杂业务问答与检索增强。",
    value: "无需新增独立向量服务栈即可落地 Hybrid。",
  },
  {
    audience: "行业解决方案团队",
    scenario: "需要在售前和评审中清晰呈现技术可行性与业务价值。",
    value: "形成可复用的演示路径与可量化结论。",
  },
];

const ttvStages = [
  {
    title: "第 0 天：准备",
    detail: "明确数据来源、索引命名规范与验收指标（延迟、命中质量、稳定性）。",
  },
  {
    title: "第 1 天：试点",
    detail: "执行核心流程，沉淀截图、请求 JSON、时延对比等决策证据。",
  },
  {
    title: "第 3-7 天：业务验证",
    detail: "将技术结果映射到业务流程，输出可供管理层评估的决策材料。",
  },
];

const lighthouse = [
  {
    name: "电商搜索升级",
    fit: "大规模目录向量 + 季节性流量波动",
    outcome: "通过 OSS 外置向量降低内存压力，同时保留 ES 搜索治理能力。",
  },
  {
    name: "企业知识助手",
    fit: "需要词法精确与语义召回共同发挥",
    outcome: "使用 Hybrid 流程更快迭代检索质量并形成可复盘证据。",
  },
  {
    name: "风控审查平台",
    fit: "对审计与可追溯性要求高",
    outcome: "在 Elasticsearch 主链路下完成向量能力增强与治理一致性。",
  },
];

export default function SolutionsZhPage() {
  return (
    <main className="min-h-screen bg-dark">
      <SiteNav lang="zh" section="solutions" />

      <section className="relative overflow-hidden px-6 pb-12 pt-16">
        <div className="absolute inset-0 grid-pattern opacity-20" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl">
          <p className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary-dark">
            品牌与销售打法
          </p>
          <h1 className="mt-5 text-3xl font-semibold text-white md:text-5xl">面向目标用户的价值叙事与落地方法</h1>
          <p className="mt-4 max-w-3xl text-gray-500">本页用于组织对外表达：服务谁、解决什么问题、如何快速验证价值并形成灯塔案例。</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/zh/core-flow"
              className="rounded-full border border-primary/40 bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              执行核心流程
            </Link>
            <Link
              href="/docs/branding-saling-strategies.md"
              className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              查看品牌策略文档
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white">用户画像与适配场景</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {segments.map((item) => (
              <article key={item.audience} className="glass-card p-5">
                <p className="text-xs uppercase tracking-[0.08em] text-gray-500">{item.audience}</p>
                <p className="mt-2 text-sm text-white">{item.scenario}</p>
                <p className="mt-3 text-sm font-semibold text-primary-dark">{item.value}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white">TTV（价值到达时间）方法</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {ttvStages.map((stage) => (
              <article key={stage.title} className="glass-card p-5">
                <p className="text-sm font-semibold text-white">{stage.title}</p>
                <p className="mt-2 text-sm text-gray-500">{stage.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold text-white">灯塔案例模板</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {lighthouse.map((item) => (
              <article key={item.name} className="glass-card p-5">
                <p className="text-base font-semibold text-white">{item.name}</p>
                <p className="mt-2 text-sm text-gray-500">适配场景: {item.fit}</p>
                <p className="mt-3 text-sm text-primary-dark">{item.outcome}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PerformanceDashboard />

      <SiteFooter lang="zh" />
    </main>
  );
}
