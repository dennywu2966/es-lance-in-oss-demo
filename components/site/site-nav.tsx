"use client";

import Link from "next/link";
import { useEffect } from "react";
import { docsHrefForLang, storeSiteLang } from "@/lib/site-language";

type SiteLang = "en" | "zh";
type SiteSection = "home" | "core-flow" | "solutions";

interface SiteNavProps {
  lang?: SiteLang;
  section?: SiteSection;
}

interface NavCopy {
  brand: string;
  summary: string;
  home: string;
  coreFlow: string;
  solutions: string;
  docs: string;
  langToggle: string;
}

const COPY: Record<SiteLang, NavCopy> = {
  en: {
    brand: "Lance Vector for Elasticsearch",
    summary: "Cloud-native vector search with low-memory architecture",
    home: "Home",
    coreFlow: "Core Flow",
    solutions: "Solutions",
    docs: "Docs",
    langToggle: "中文",
  },
  zh: {
    brand: "Elasticsearch Lance 向量能力",
    summary: "云原生低内存向量检索与可验证链路",
    home: "首页",
    coreFlow: "核心流程",
    solutions: "场景与价值",
    docs: "文档",
    langToggle: "EN",
  },
};

function pathsForLang(lang: SiteLang, section: SiteSection) {
  if (lang === "zh") {
    return {
      home: "/zh",
      coreFlow: "/zh/core-flow",
      solutions: "/zh/solutions",
      docs: "/docs",
      langToggle:
        section === "core-flow" ? "/core-flow" : section === "solutions" ? "/solutions" : "/",
    };
  }

  return {
    home: "/",
    coreFlow: "/core-flow",
    solutions: "/solutions",
    docs: "/docs",
    langToggle:
      section === "core-flow" ? "/zh/core-flow" : section === "solutions" ? "/zh/solutions" : "/zh",
  };
}

function navItemClass(active: boolean) {
  if (active) {
    return "rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary-dark";
  }
  return "rounded-full px-3 py-1.5 text-gray-600 hover:bg-white/10";
}

export function SiteNav({ lang = "en", section = "home" }: SiteNavProps) {
  const copy = COPY[lang];
  const paths = pathsForLang(lang, section);

  useEffect(() => {
    storeSiteLang(lang);
  }, [lang]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-dark/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div className="min-w-0">
          <Link href={paths.home} className="block text-sm font-semibold text-white">
            {copy.brand}
          </Link>
          <p className="truncate text-xs text-gray-500">{copy.summary}</p>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link className={navItemClass(section === "home")} href={paths.home}>
            {copy.home}
          </Link>
          <Link className={navItemClass(section === "core-flow")} href={paths.coreFlow}>
            {copy.coreFlow}
          </Link>
          <Link className={navItemClass(section === "solutions")} href={paths.solutions}>
            {copy.solutions}
          </Link>
          <Link className="rounded-full px-3 py-1.5 text-gray-600 hover:bg-white/10" href={docsHrefForLang(lang)}>
            {copy.docs}
          </Link>
          <Link
            className="rounded-full border border-primary/40 bg-primary/15 px-3 py-1.5 font-semibold text-primary-dark"
            href={paths.langToggle}
          >
            {copy.langToggle}
          </Link>
        </nav>
      </div>
    </header>
  );
}
