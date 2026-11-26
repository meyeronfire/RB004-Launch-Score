import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { launchPages } from "@/app/launch-pages";
import { TrackedScanLink } from "@/components/tracked-scan-link";
export function generateStaticParams(){return Object.keys(launchPages).map(landing=>({landing}));}
export async function generateMetadata({params}:{params:Promise<{landing:string}>}):Promise<Metadata>{
  const {landing}=await params;
  const page=launchPages[landing as keyof typeof launchPages];
  if(!page)return {title:"Not found"};
  const title="seoTitle" in page ? `${page.seoTitle} | Ready for Real` : `${page.title} | Ready for Real`;
  return {title,description:page.desc,alternates:{canonical:`/${landing}`},openGraph:{title,description:page.desc,url:`/${landing}`,type:"article"}};
}
export default async function LaunchPage({params}:{params:Promise<{landing:string}>}){
  const {landing}=await params;
  const page=launchPages[landing as keyof typeof launchPages];
  if(!page)notFound();

  return <main className="wrap editorial" style={{paddingTop:"3rem",maxWidth:900}}>
    <p className="mono">PRACTICAL LAUNCH GUIDE · FOR FOUNDERS</p>
    <article>
      <h1>{page.title}</h1>
      <p>{page.intro}</p>
      <p><TrackedScanLink source={`/${landing}`}/></p>
      {"sections" in page ? <>
        {page.sections.map((section)=><section key={section.heading} style={{marginTop:"2.5rem"}}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
          {"points" in section && <ul>{section.points.map((point)=><li key={point} style={{margin:"0.75rem 0"}}>{point}</li>)}</ul>}
        </section>)}
      </> : <>
        <h2>Work through these checks</h2>
        <ol>{page.steps.map(step=><li key={step} style={{margin:"1rem 0"}}>{step}</li>)}</ol>
      </>}
      <section style={{marginTop:"2.5rem"}}>
        <h2>What a public launch scan can verify</h2>
        <p>Ready for Real reviews the page a visitor can reach: its message, user experience, trust signals, mobile behavior, SEO basics, and selected technical signals. A public scan cannot inspect private source code, prove account or database permissions, or certify production security. Use its findings as evidence alongside the owner checks above.</p>
        {landing === "website-launch-checklist" && <><p><Link href="/website-launch-readiness-checker">Run the free website launch readiness checker →</Link></p><p><Link href="/guides/audit-ai-website">Read the detailed website audit guide →</Link></p></>}
        {landing === "saas-launch-checklist" && <p><Link href="/guides/first-saas-users">Continue with the first-users guide →</Link></p>}
      </section>
      {"sources" in page && <section style={{marginTop:"2.5rem"}}>
        <h2>Official documentation</h2>
        <ul>{page.sources.map((source)=><li key={source.url}><a href={source.url} rel="noreferrer">{source.label} ↗</a></li>)}</ul>
      </section>}
      <p style={{marginTop:"2rem"}}><TrackedScanLink source={`/${landing}-bottom`}/></p>
      <p><Link href="/checklists">Open the interactive launch checklist</Link> · <Link href="/methodology">Read the scan methodology</Link></p>
    </article>
  </main>;
}
