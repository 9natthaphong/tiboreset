import Link from "next/link";

export function LabNavigation({ active }: { active: "control" | "data" }) {
  return <nav className="lab-navigation" aria-label="Lab navigation">
    {active === "control" && <Link href="/control-room" className="active" aria-current="page">Control Room</Link>}
    <Link href="/lab/data" className={active === "data" ? "active" : ""} aria-current={active === "data" ? "page" : undefined}>Data Lab</Link>
    <Link href="/">Public Forecast <span aria-hidden="true">↗</span></Link>
  </nav>;
}
