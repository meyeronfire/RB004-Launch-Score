"use client";
import { useEffect } from "react";

// Marks watched elements with data-reveal as they enter the viewport and adds
// .revealed; CSS owns the actual motion. Primary mechanism is
// IntersectionObserver; a passive scroll/resize listener is the fallback for
// environments where IO delivery is unreliable.
export function ScrollReveal({ selectors }: { selectors: string }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("revealed"); observer.unobserve(entry.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    const revealInView = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.revealed)").forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.96 && rect.bottom > 0) element.classList.add("revealed");
      });
    };
    const watch = () => document.querySelectorAll<HTMLElement>(selectors).forEach((element) => {
      if (element.classList.contains("revealed")) return;
      if (!element.hasAttribute("data-reveal")) {
        element.setAttribute("data-reveal", "");
        const peers = element.parentElement ? Array.from(element.parentElement.children).filter((child) => child.hasAttribute("data-reveal")) : [];
        element.style.transitionDelay = `${Math.min(peers.indexOf(element), 6) * 55}ms`;
      }
      observer.observe(element);
    });
    watch();
    revealInView();
    const onScroll = () => { revealInView(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Safety net: reveal on a low-frequency interval as well — covers environments
    // where neither IO delivery nor scroll-event dispatch is reliable.
    const interval = window.setInterval(revealInView, 300);
    const mutation = new MutationObserver(() => { watch(); revealInView(); });
    mutation.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutation.disconnect(); window.clearInterval(interval); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [selectors]);
  return null;
}
