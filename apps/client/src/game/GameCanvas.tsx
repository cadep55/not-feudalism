import type { CharacterState, Direction, Job, NodeId } from "@nf/shared";
import { useEffect, useRef } from "react";
import type { MoveOutcome, World } from "./createGame.ts";
import type { Tile } from "./movement.ts";

type Props = {
  character: CharacterState;
  /** The character's job in progress; the world shows its progress bar. */
  job: Job | null;
  sendPosition: (tile: Tile) => Promise<MoveOutcome>;
  startGather: (nodeId: NodeId) => void;
  /** Turns the character in place; resolves true once the server accepts. */
  turn: (facing: Direction) => Promise<boolean>;
};

/**
 * Hosts the Phaser game. Phaser is loaded lazily so the login screen stays
 * small and tests of React screens never load a canvas engine.
 */
export function GameCanvas({ character, job, sendPosition, startGather, turn }: Props) {
  const parent = useRef<HTMLDivElement>(null);
  // The game is created once per character; it always calls the latest callbacks.
  const send = useRef(sendPosition);
  send.current = sendPosition;
  const gather = useRef(startGather);
  gather.current = startGather;
  const turnTo = useRef(turn);
  turnTo.current = turn;
  const latestJob = useRef(job);
  latestJob.current = job;
  const initial = useRef(character);
  const world = useRef<World | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("./createGame.ts").then(({ createGame }) => {
      if (cancelled || !parent.current) return;
      world.current = createGame(parent.current, {
        character: initial.current,
        job: latestJob.current,
        sendPosition: (tile) => send.current(tile),
        startGather: (nodeId) => gather.current(nodeId),
        turn: (facing) => turnTo.current(facing),
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

  return <div ref={parent} className="canvas" data-testid="game-canvas" />;
}
