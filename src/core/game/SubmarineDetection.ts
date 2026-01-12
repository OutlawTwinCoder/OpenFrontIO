import { Config } from "../configuration/Config";
import { Game, Player, Unit, UnitType } from "./Game";
import { TileRef } from "./GameMap";
import { GameView, PlayerView, UnitView } from "./GameView";

type DetectionGame = {
  nearbyUnits: (
    tile: TileRef,
    searchRange: number,
    types: UnitType | UnitType[],
    predicate?: (value: {
      unit: Unit | UnitView;
      distSquared: number;
    }) => boolean,
  ) => Array<{ unit: Unit | UnitView; distSquared: number }>;
  config(): Config;
};

type DetectionUnit = {
  owner(): { id(): string };
  tile(): TileRef;
};

type DetectionPlayer = {
  id(): string;
};

export function isSubmarineVisibleToPlayer(
  game: Game,
  submarine: Unit,
  viewer: Player,
): boolean;
export function isSubmarineVisibleToPlayer(
  game: GameView,
  submarine: UnitView,
  viewer: PlayerView,
): boolean;
export function isSubmarineVisibleToPlayer(
  game: DetectionGame,
  submarine: DetectionUnit,
  viewer: DetectionPlayer | null,
): boolean {
  if (viewer === null) {
    return false;
  }
  if (submarine.owner().id() === viewer.id()) {
    return true;
  }

  const radarRange = game.config().radarShipDetectionRange();
  const sonarRange = game.config().sonarStationDetectionRange();

  const hasRadarShip =
    game.nearbyUnits(
      submarine.tile(),
      radarRange,
      UnitType.RadarShip,
      ({ unit }) => unit.owner().id() === viewer.id(),
    ).length > 0;

  if (hasRadarShip) {
    return true;
  }

  return (
    game.nearbyUnits(
      submarine.tile(),
      sonarRange,
      UnitType.SonarStation,
      ({ unit }) => unit.owner().id() === viewer.id(),
    ).length > 0
  );
}
