import { currentForecast, state } from "@/lib/demo-store";
import demo from "@/data/demo.json";
import { OracleExperience } from "@/components/oracle-experience";

export const dynamic = "force-dynamic";

export default function Page() {
  const store = state();
  const history = store.forecasts.map((forecast, index) => ({ time: forecast.generatedAt, probability: Math.round(forecast.probability * 100), label: demo.history[index]?.label ?? "New forecast evidence" }));
  return <OracleExperience initialForecast={currentForecast()} evidence={store.evidence} history={history} timeline={demo.timeline} analogs={demo.analogs} renderedAt={new Date().toISOString()}/>;
}
