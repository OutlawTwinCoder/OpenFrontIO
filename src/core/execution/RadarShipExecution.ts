import {
  Execution,
  Game,
  isUnit,
  OwnerComp,
  Unit,
  UnitParams,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { isSubmarineVisibleToPlayer } from "../game/SubmarineDetection";
import { PathFinding } from "../pathfinding/PathFinder";
import { PathStatus, SteppingPathFinder } from "../pathfinding/types";
import { PseudoRandom } from "../PseudoRandom";
import { ShellExecution } from "./ShellExecution";

export class RadarShipExecution implements Execution {
  private random: PseudoRandom;
  private radarShip: Unit;
  private mg: Game;
  private pathfinder: SteppingPathFinder<TileRef>;
  private lastShellAttack = 0;
  private alreadySentShell = new Set<Unit>();

  constructor(
    private input: (UnitParams<UnitType.RadarShip> & OwnerComp) | Unit,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.pathfinder = PathFinding.Water(mg);
    this.random = new PseudoRandom(mg.ticks());
    if (isUnit(this.input)) {
      this.radarShip = this.input;
    } else {
      const spawn = this.input.owner.canBuild(
        UnitType.RadarShip,
        this.input.patrolTile,
      );
      if (spawn === false) {
        console.warn(
          `Failed to spawn radar ship for ${this.input.owner.name()} at ${this.input.patrolTile}`,
        );
        return;
      }
      this.radarShip = this.input.owner.buildUnit(
        UnitType.RadarShip,
        spawn,
        this.input,
      );
    }
  }

  tick(ticks: number): void {
    if (this.radarShip.health() <= 0) {
      this.radarShip.delete();
      return;
    }

    const hasPort = this.radarShip.owner().unitCount(UnitType.Port) > 0;
    if (hasPort) {
      this.radarShip.modifyHealth(1);
    }

    this.radarShip.setTargetUnit(this.findTargetUnit());
    if (this.radarShip.targetUnit()?.type() === UnitType.TradeShip) {
      this.huntDownTradeShip();
      return;
    }

    this.patrol();

    if (this.radarShip.targetUnit() !== undefined) {
      this.shootTarget();
      return;
    }
  }

  private findTargetUnit(): Unit | undefined {
    const hasPort = this.radarShip.owner().unitCount(UnitType.Port) > 0;
    const patrolRangeSquared = this.mg.config().warshipPatrolRange() ** 2;

    const ships = this.mg.nearbyUnits(
      this.radarShip.tile()!,
      this.mg.config().warshipTargettingRange(),
      [
        UnitType.TransportShip,
        UnitType.Warship,
        UnitType.RadarShip,
        UnitType.Submarine,
        UnitType.TradeShip,
      ],
    );
    const potentialTargets: { unit: Unit; distSquared: number }[] = [];
    for (const { unit, distSquared } of ships) {
      if (
        unit.owner() === this.radarShip.owner() ||
        unit === this.radarShip ||
        !this.radarShip.owner().canAttackPlayer(unit.owner(), true) ||
        this.alreadySentShell.has(unit)
      ) {
        continue;
      }
      if (
        unit.type() === UnitType.Submarine &&
        !isSubmarineVisibleToPlayer(this.mg, unit, this.radarShip.owner())
      ) {
        continue;
      }
      if (unit.type() === UnitType.TradeShip) {
        if (
          !hasPort ||
          unit.isSafeFromPirates() ||
          unit.targetUnit()?.owner() === this.radarShip.owner() ||
          unit.targetUnit()?.owner().isFriendly(this.radarShip.owner())
        ) {
          continue;
        }
        if (
          this.mg.euclideanDistSquared(
            this.radarShip.patrolTile()!,
            unit.tile(),
          ) > patrolRangeSquared
        ) {
          continue;
        }
      }
      potentialTargets.push({ unit: unit, distSquared });
    }

    return potentialTargets.sort((a, b) => {
      const { unit: unitA, distSquared: distA } = a;
      const { unit: unitB, distSquared: distB } = b;

      if (
        unitA.type() === UnitType.TransportShip &&
        unitB.type() !== UnitType.TransportShip
      )
        return -1;
      if (
        unitA.type() !== UnitType.TransportShip &&
        unitB.type() === UnitType.TransportShip
      )
        return 1;

      if (
        unitA.type() === UnitType.Submarine &&
        unitB.type() !== UnitType.Submarine
      )
        return -1;
      if (
        unitA.type() !== UnitType.Submarine &&
        unitB.type() === UnitType.Submarine
      )
        return 1;

      if (
        unitA.type() === UnitType.Warship &&
        unitB.type() !== UnitType.Warship
      )
        return -1;
      if (
        unitA.type() !== UnitType.Warship &&
        unitB.type() === UnitType.Warship
      )
        return 1;

      return distA - distB;
    })[0]?.unit;
  }

  private shootTarget() {
    const shellAttackRate = this.mg.config().warshipShellAttackRate();
    if (this.mg.ticks() - this.lastShellAttack > shellAttackRate) {
      if (this.radarShip.targetUnit()?.type() !== UnitType.TransportShip) {
        this.lastShellAttack = this.mg.ticks();
      }
      this.mg.addExecution(
        new ShellExecution(
          this.radarShip.tile(),
          this.radarShip.owner(),
          this.radarShip,
          this.radarShip.targetUnit()!,
        ),
      );
      if (!this.radarShip.targetUnit()!.hasHealth()) {
        this.alreadySentShell.add(this.radarShip.targetUnit()!);
        this.radarShip.setTargetUnit(undefined);
        return;
      }
    }
  }

  private huntDownTradeShip() {
    for (let i = 0; i < 2; i++) {
      const result = this.pathfinder.next(
        this.radarShip.tile(),
        this.radarShip.targetUnit()!.tile(),
        5,
      );
      switch (result.status) {
        case PathStatus.COMPLETE:
          this.radarShip.owner().captureUnit(this.radarShip.targetUnit()!);
          this.radarShip.setTargetUnit(undefined);
          this.radarShip.move(this.radarShip.tile());
          return;
        case PathStatus.NEXT:
          this.radarShip.move(result.node);
          break;
        case PathStatus.PENDING:
          this.radarShip.touch();
          break;
        case PathStatus.NOT_FOUND: {
          console.log(`path not found to target`);
          break;
        }
      }
    }
  }

  private patrol() {
    if (this.radarShip.targetTile() === undefined) {
      this.radarShip.setTargetTile(this.randomTile());
      if (this.radarShip.targetTile() === undefined) {
        return;
      }
    }

    const result = this.pathfinder.next(
      this.radarShip.tile(),
      this.radarShip.targetTile()!,
    );
    switch (result.status) {
      case PathStatus.COMPLETE:
        this.radarShip.setTargetTile(undefined);
        this.radarShip.move(result.node);
        break;
      case PathStatus.NEXT:
        this.radarShip.move(result.node);
        break;
      case PathStatus.PENDING:
        this.radarShip.touch();
        return;
      case PathStatus.NOT_FOUND: {
        console.log(`path not found to target`);
        break;
      }
    }
  }

  isActive(): boolean {
    return this.radarShip?.isActive();
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  randomTile(allowShoreline: boolean = false): TileRef | undefined {
    let patrolRange = this.mg.config().warshipPatrolRange();
    const maxAttemptBeforeExpand: number = 500;
    let attempts: number = 0;
    let expandCount: number = 0;

    const component = this.mg.getWaterComponent(this.radarShip.tile());

    while (expandCount < 3) {
      const x =
        this.mg.x(this.radarShip.patrolTile()!) +
        this.random.nextInt(-patrolRange / 2, patrolRange / 2);
      const y =
        this.mg.y(this.radarShip.patrolTile()!) +
        this.random.nextInt(-patrolRange / 2, patrolRange / 2);
      if (!this.mg.isValidCoord(x, y)) {
        continue;
      }
      const tile = this.mg.ref(x, y);
      if (
        !this.mg.isOcean(tile) ||
        (!allowShoreline && this.mg.isShoreline(tile))
      ) {
        attempts++;
        if (attempts === maxAttemptBeforeExpand) {
          expandCount++;
          attempts = 0;
          patrolRange = patrolRange + Math.floor(patrolRange / 2);
        }
        continue;
      }
      if (component !== null && !this.mg.hasWaterComponent(tile, component)) {
        attempts++;
        if (attempts === maxAttemptBeforeExpand) {
          expandCount++;
          attempts = 0;
          patrolRange = patrolRange + Math.floor(patrolRange / 2);
        }
        continue;
      }
      return tile;
    }
    console.warn(
      `Failed to find random tile for radar ship for ${this.radarShip.owner().name()}`,
    );
    if (!allowShoreline) {
      return this.randomTile(true);
    }
    return undefined;
  }
}
