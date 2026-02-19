import Link from "next/link";
import { docsHrefForLang } from "@/lib/site-language";

type SiteLang = "en" | "zh";

interface SiteFooterProps {
  lang?: SiteLang;
}

const COPY = {
  en: {
    title: "Lance Vector Plugin for Elasticsearch",
    summary: "Built for search platform teams who need production vector retrieval without memory blowups.",
    links: {
      home: "Home",
      coreFlow: "Core Flow",
      solutions: "Solutions",
      docs: "Docs",
    },
    trust: "Validated through API, UI, and end-to-end regression suites.",
  },
  zh: {
    title: "Elasticsearch Lance 向量插件",
    summary: "面向搜索平台团队，提供可生产落地的低内存向量检索方案。",
    links: {
      home: "首页",
      coreFlow: "核心流程",
      solutions: "场景与价值",
      docs: "文档",
    },
    trust: "通过 API、UI 与端到端回归链路持续验证。",
  },
} as const;

export function SiteFooter({ lang = "en" }: SiteFooterProps) {
  const c = COPY[lang];
  const home = lang === "zh" ? "/zh" : "/";
  const coreFlow = lang === "zh" ? "/zh/core-flow" : "/core-flow";
  const solutions = lang === "zh" ? "/zh/solutions" : "/solutions";

  return (
    <footer className="mt-20 border-t border-white/10 bg-dark/70">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 md:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="text-sm font-semibold text-white">{c.title}</p>
          <p className="mt-2 max-w-xl text-sm text-gray-500">{c.summary}</p>
          <p className="mt-3 text-xs text-gray-500">{c.trust}</p>
        </div>
        <div className="flex flex-wrap items-start justify-start gap-3 text-sm md:justify-end">
          <Link className="rounded-full px-3 py-1.5 text-gray-600 hover:bg-white/10" href={home}>
            {c.links.home}
          </Link>
          <Link className="rounded-full px-3 py-1.5 text-gray-600 hover:bg-white/10" href={coreFlow}>
            {c.links.coreFlow}
          </Link>
          <Link className="rounded-full px-3 py-1.5 text-gray-600 hover:bg-white/10" href={solutions}>
            {c.links.solutions}
          </Link>
          <Link className="rounded-full px-3 py-1.5 text-gray-600 hover:bg-white/10" href={docsHrefForLang(lang)}>
            {c.links.docs}
          </Link>
        </div>
      </div>
    </footer>
  );
}
