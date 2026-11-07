"use client";
import { useEffect } from "react";

// Marks watched elements with data-reveal as they enter the viewport and adds
// .revealed; CSS owns the actual motion. MutationObserver re-watches as report
// data streams in.
export function ScrollReveal({ selectors }: { selectors: string }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("revealed"); observer.unobserve(entry.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
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
    const mutation = new MutationObserver(watch);
    mutation.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutation.disconnect(); };
  }, [selectors]);
  return null;
}
