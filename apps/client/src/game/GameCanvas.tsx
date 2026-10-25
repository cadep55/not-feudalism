import type { CharacterState, Direction, Field, Job, NodeId } from "@nf/shared";
import { useEffect, useRef } from "react";
import type { MoveOutcome, World } from "./createGame.ts";
import type { Tile } from "./movement.ts";

type Props = {
  character: CharacterState;
  /** The character's job in progress; the world shows its progress bar. */
  job: Job | null;
  /** The wheat fields; the world draws them and redraws when they change. */
  fields: Field[];
  sendPosition: (tile: Tile) => Promise<MoveOutcome>;
  startGather: (nodeId: NodeId) => void;
  /** Called once the character stands beside a field, facing it. */
  startHarvest: (fieldId: string) => void;
  /** Turns the character in place; resolves true once the server accepts. */
  turn: (facing: Direction) => Promise<boolean>;
  /** Called once the character stands beside the storehouse, facing it. */
  openStorehouse: () => void;
};

/**
 * Hosts the Phaser game. Phaser is loaded lazily so the login screen stays
 * small and tests of React screens never load a canvas engine.
 */
export function GameCanvas({
  character,
  job,
  fields,
  sendPosition,
  startGather,
  startHarvest,
  turn,
  openStorehouse,
}: Props) {
  const parent = useRef<HTMLDivElement>(null);
  // The game is created once per character; it always calls the latest callbacks.
  const send = useRef(sendPosition);
  send.current = sendPosition;
  const gather = useRef(startGather);
  gather.current = startGather;
  const harvest = useRef(startHarvest);
  harvest.current = startHarvest;
  const turnTo = useRef(turn);
  turnTo.current = turn;
  const open = useRef(openStorehouse);
  open.current = openStorehouse;
  const latestJob = useRef(job);
  latestJob.current = job;
  const latestFields = useRef(fields);
  latestFields.current = fields;
  const initial = useRef(character);
  const world = useRef<World | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("./createGame.ts").then(({ createGame }) => {
      if (cancelled || !parent.current) return;
      world.current = createGame(parent.current, {
        character: initial.current,
        job: latestJob.current,
        fields: latestFields.current,
        sendPosition: (tile) => send.current(tile),
        startGather: (nodeId) => gather.current(nodeId),
        startHarvest: (fieldId) => harvest.current(fieldId),
        turn: (facing) => turnTo.current(facing),
        openStorehouse: () => open.current(),
      });
    });
    return () => {
      cancelled = true;
      world.current?.destroy();
      world.current = null;
    };
  }, []);

  useEffect(() => {
    world.current?.setJob(job);
  }, [job]);

  useEffect(() => {
    world.current?.setFields(fields);
  }, [fields]);

  return <div ref={parent} className="canvas" data-testid="game-canvas" />;
}
