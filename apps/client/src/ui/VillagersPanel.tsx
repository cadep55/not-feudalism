import { VILLAGER_JOBS, type Villager, type VillagerJob } from "@nf/shared";
import { JOB_LABELS, villagerJob, villagerStatus } from "../game/villagers.ts";

type Props = {
  villagers: Villager[];
  onAssign: (villagerId: string, job: VillagerJob) => void;
};

function isJob(value: string): value is VillagerJob {
  return (VILLAGER_JOBS as readonly string[]).includes(value);
}

/**
 * The villagers living in the house: what each is doing, and a dropdown to give
 * it a job. The server decides; farming needs a rake in the storehouse per villager.
 */
export function VillagersPanel({ villagers, onAssign }: Props) {
  return (
    <section className="panel villagers" aria-labelledby="villagers-title">
      <h2 id="villagers-title">Villagers</h2>
      {villagers.length === 0 ? (
        <p className="empty">No villagers live here yet.</p>
      ) : (
        <ul>
          {villagers.map((villager) => {
            const selectId = `villager-job-${villager.id}`;
            return (
              <li key={villager.id} className="villager">
                <span>
                  <span className="name">{villager.name}</span>{" "}
                  <span className="villager-status">{villagerStatus(villager.task)}</span>
                </span>
                <label htmlFor={selectId} className="visually-hidden">
                  Job for {villager.name}
                </label>
                <select
                  id={selectId}
                  value={villagerJob(villager.task)}
                  onChange={(event) => {
                    const job = event.target.value;
                    if (isJob(job)) onAssign(villager.id, job);
                  }}
                >
                  {VILLAGER_JOBS.map((job) => (
                    <option key={job} value={job}>
                      {JOB_LABELS[job]}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
