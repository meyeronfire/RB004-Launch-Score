"use client";
import Link from "next/link";
import {track} from "@/lib/analytics-client";
export function TrackedScanLink({source,children="Scan your app for free →"}:{source:string;children?:React.ReactNode}){return <Link href="/" onClick={()=>track("landing_cta_clicked",{landing_path:source})}>{children}</Link>}
