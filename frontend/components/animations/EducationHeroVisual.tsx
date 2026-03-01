"use client";

import { useEffect, useMemo, useState } from "react";

const WELCOME_MESSAGE = "Welcome FIT23 batch mates! Let us learn, build, and win together.";

export default function EducationHeroVisual() {
  const [typedCount, setTypedCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTypedCount((current) => {
        if (current >= WELCOME_MESSAGE.length) {
          return 0;
        }

        return current + 1;
      });
    }, 55);

    return () => clearInterval(interval);
  }, []);

  const typedLine = useMemo(() => WELCOME_MESSAGE.slice(0, typedCount), [typedCount]);

  return (
    <div className="hero-float relative w-full max-w-md rounded-[1.6rem] bg-gradient-to-br from-[var(--accent)] via-[#2a4fb5] to-[var(--primary)] p-[2px] shadow-[0_18px_45px_rgba(8,18,43,0.55)]">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/5 bg-[linear-gradient(165deg,#090f1d_0%,#0b1326_58%,#08111f_100%)]">
        <div className="hero-glow pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.38)_0%,rgba(56,189,248,0)_72%)]" />
        <div className="hero-glow pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(30,58,138,0.48)_0%,rgba(30,58,138,0)_72%)] [animation-delay:1.2s]" />

        <div className="flex items-center justify-between border-b border-[#5cb9f338] px-4 py-3 text-[11px] text-[#9dd8ff]">
          <p className="font-semibold uppercase tracking-[0.12em]">FIT23Hub welcome.ts</p>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          </div>
        </div>

        <div className="relative z-10 space-y-2 px-4 py-4 font-mono text-[12px] md:text-[13px]">
          <div className="text-[#5f7798]">
            <span className="mr-3">1</span>
            <span className="text-[#66c4ff]">type</span> <span className="text-[#d8ecff]">Batch</span> ={" "}
            <span className="text-[#8ee4b8]">&quot;FIT23&quot;</span>;
          </div>
          <div className="text-[#5f7798]">
            <span className="mr-3">2</span>
            <span className="text-[#66c4ff]">const</span> <span className="text-[#d8ecff]">mission</span> ={" "}
            <span className="text-[#8ee4b8]">&quot;Study hard. Build together.&quot;</span>;
          </div>
          <div className="text-[#5f7798]">
            <span className="mr-3">3</span>
            <span className="text-[#66c4ff]">const</span> <span className="text-[#d8ecff]">welcome</span> ={" "}
            <span className="text-[#8ee4b8]">&quot;{typedLine}</span>
            <span className="hero-caret inline-block text-[#8ee4b8]">|</span>
            <span className="text-[#8ee4b8]">&quot;</span>;
          </div>
          <div className="text-[#5f7798]">
            <span className="mr-3">4</span>
            <span className="text-[#66c4ff]">console</span>.<span className="text-[#d8ecff]">log</span>(
            <span className="text-[#d8ecff]">welcome</span>);
          </div>
        </div>

        <div className="hero-chip absolute bottom-4 right-4 rounded-full border border-[#60d2ff59] bg-[#0e2a4fdb] px-3 py-1 text-[11px] font-semibold text-[#d6f4ff]">
          Batch23 Online
        </div>
        <div className="hero-scan pointer-events-none absolute inset-x-0 top-[52%] h-px bg-gradient-to-r from-transparent via-[#84dcff] to-transparent opacity-70" />
      </div>
    </div>
  );
}
