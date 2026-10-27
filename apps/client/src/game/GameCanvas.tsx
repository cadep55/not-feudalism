import type {
  Building,
  BuildingKind,
  CharacterState,
  Direction,
  Field,
  Job,
  NodeId,
  OtherBase,
  Villager,
} from "@nf/shared";
import { useEffect, useRef } from "react";
import type { MoveOutcome, World } from "./createGame.ts";
import type { Tile } from "./movement.ts";

type Props = {
  character: CharacterState;
  /** The character's job in progress; the world shows its progress bar. */
  job: Job | null;
  /** The wheat fields; the world draws them and redraws when they change. */
  fields: Field[];
  /** The villagers; the world draws them working or wandering. */
  villagers: Villager[];
  /** The houses and storehouses; the world draws them and redraws when they change. */
  buildings: Building[];
  /** Other players' bases in this section, drawn for looking at. */
  others: OtherBase[];
  sendPosition: (tile: Tile) => Promise<MoveOutcome>;
  startGather: (nodeId: NodeId) => void;
  /** Called once the character stands beside a field, facing it. */
  startHarvest: (fieldId: string) => void;
  /** Turns the character in place; resolves true once the server accepts. */
  turn: (facing: Direction) => Promise<boolean>;
  /** Called once the character stands beside the storehouse, facing it. */
  openStorehouse: () => void;
  /** The kind of building being placed, or null when not placing. */
  placing: BuildingKind | null;
  /** Called when the player clicks a free spot while placing. */
  build: (kind: BuildingKind, x: number, y: number) => void;
  /** Called when the character stands still on a travel zone. */
  startTravel: () => void;
};

/**
 * Hosts the Phaser game. Phaser is loaded lazily so the login screen stays
 * small and tests of React screens never load a canvas engine.
 */
export function GameCanvas({
  character,
  job,
  fields,
  villagers,
  buildings,
  others,
  sendPosition,
  startGather,
  startHarvest,
  turn,
  openStorehouse,
  placing,
  build,
  startTravel,
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
  const place = useRef(build);
  place.current = build;
  const latestPlacing = useRef(placing);
  latestPlacing.current = placing;
  const latestJob = useRef(job);
  latestJob.current = job;
  const latestFields = useRef(fields);
  latestFields.current = fields;
  const latestVillagers = useRef(villagers);
  latestVillagers.current = villagers;
  const latestBuildings = useRef(buildings);
  latestBuildings.current = buildings;
  const latestOthers = useRef(others);
  latestOthers.current = others;
  const travel = useRef(startTravel);
  travel.current = startTravel;
  const latestCharacter = useRef(character);
  latestCharacter.current = character;
  const world = useRef<World | null>(null);

  // A new game per section: arriving somewhere else (after travelling) loads that section's map.
  const { region } = character;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the game is rebuilt when the section changes; everything else reaches it through refs.
  useEffect(() => {
    let cancelled = false;
    import("./createGame.ts").then(({ createGame }) => {
      if (cancelled || !parent.current) return;
      world.current = createGame(parent.current, {
        character: latestCharacter.current,
        job: latestJob.current,
        fields: latestFields.current,
        villagers: latestVillagers.current,
        buildings: latestBuildings.current,
        others: latestOthers.current,
        sendPosition: (tile) => send.current(tile),
        startGather: (nodeId) => gather.current(nodeId),
        startHarvest: (fieldId) => harvest.current(fieldId),
        turn: (facing) => turnTo.current(facing),
        openStorehouse: () => open.current(),
        build: (kind, x, y) => place.current(kind, x, y),
        startTravel: () => travel.current(),
      });
      world.current.setPlacing(latestPlacing.current);
    });
    return () => {
      cancelled = true;
      world.current?.destroy();
      world.current = null;
    };
  }, [region]);

  useEffect(() => {
    world.current?.setJob(job);
  }, [job]);

  useEffect(() => {
    world.current?.setFields(fields);
  }, [fields]);

  useEffect(() => {
    world.current?.setVillagers(villagers);
  }, [villagers]);

  useEffect(() => {
    world.current?.setBuildings(buildings);
  }, [buildings]);

  useEffect(() => {
    world.current?.setOthers(others);
  }, [others]);

  useEffect(() => {
    world.current?.setPlacing(placing);
  }, [placing]);

  return <div ref={parent} className="canvas" data-testid="game-canvas" />;
}
