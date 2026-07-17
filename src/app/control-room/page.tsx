import { notFound } from "next/navigation";
import { isControlRoomEnabled } from "@/lib/lab-auth";
import { ControlRoomClient } from "./control-room-client";

export const dynamic = "force-dynamic";

export default function ControlRoom() {
  if (!isControlRoomEnabled()) notFound();
  return <ControlRoomClient live={process.env.NEXT_PUBLIC_APP_MODE === "live"} adminConfigured={Boolean(process.env.ADMIN_SECRET)}/>;
}
