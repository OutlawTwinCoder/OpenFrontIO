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
import { PathFinding } from "../pathfinding/PathFinder";
import { PathStatus, SteppingPathFinder } from "../pathfinding/types";
import { PseudoRandom } from "../PseudoRandom";
import { ShellExecution } from "./ShellExecution";

export class SubmarineExecution implements Execution {
  private random: PseudoRandom;
  private submarine: Unit;
  private mg: Game;
  private pathfinder: SteppingPathFinder<TileRef>;
  private lastShellAttack = 0;
  private alreadySentShell = new Set<Unit>();

  constructor(
    private input: (UnitParams<UnitType.Submarine> & OwnerComp) | Unit,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    this.pathfinder = PathFinding.Water(mg);
    this.random = new PseudoRandom(mg.ticks());
    if (isUnit(this.input)) {
      this.submarine = this.input;
    } else {
      const spawn = this.input.owner.canBuild(
        UnitType.Submarine,
        this.input.patrolTile,
      );
      if (spawn === false) {
        console.warn(
          `Failed to spawn submarine for ${this.input.owner.name()} at ${this.input.patrolTile}`,
        );
        return;
      }
      this.submarine = this.input.owner.buildUnit(
        UnitType.Submarine,
        spawn,
        this.input,
      );
    }
  }

  tick(ticks: number): void {
    if (this.submarine.health() <= 0) {
      this.submarine.delete();
      return;
    }

    const hasPort = this.submarine.owner().unitCount(UnitType.Port) > 0;
    if (hasPort) {
      this.submarine.modifyHealth(1);
    }

    this.submarine.setTargetUnit(this.findTargetUnit());
    if (this.submarine.targetUnit()?.type() === UnitType.TradeShip) {
      this.huntDownTradeShip();
      return;
    }

    this.patrol();

    if (this.submarine.targetUnit() !== undefined) {
      this.shootTarget();
      return;
    }
  }

  private findTargetUnit(): Unit | undefined {
    const hasPort = this.submarine.owner().unitCount(UnitType.Port) > 0;
    const patrolRangeSquared = this.mg.config().warshipPatrolRange() ** 2;

    const ships = this.mg.nearbyUnits(
      this.submarine.tile()!,
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
        unit.owner() === this.submarine.owner() ||
        unit === this.submarine ||
        !this.submarine.owner().canAttackPlayer(unit.owner(), true) ||
        this.alreadySentShell.has(unit)
      ) {
        continue;
      }
      if (unit.type() === UnitType.TradeShip) {
        if (
          !hasPort ||
          unit.isSafeFromPirates() ||
          unit.targetUnit()?.owner() === this.submarine.owner() || // trade ship is coming to my port
          unit.targetUnit()?.owner().isFriendly(this.submarine.owner()) // trade ship is coming to my ally
        ) {
          continue;
        }
        if (
          this.mg.euclideanDistSquared(
            this.submarine.patrolTile()!,
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
      if (this.submarine.targetUnit()?.type() !== UnitType.TransportShip) {
        this.lastShellAttack = this.mg.ticks();
      }
      this.mg.addExecution(
        new ShellExecution(
          this.submarine.tile(),
          this.submarine.owner(),
          this.submarine,
          this.submarine.targetUnit()!,
        ),
      );
      if (!this.submarine.targetUnit()!.hasHealth()) {
        this.alreadySentShell.add(this.submarine.targetUnit()!);
        this.submarine.setTargetUnit(undefined);
        return;
      }
    }
  }

  private huntDownTradeShip() {
    for (let i = 0; i < 2; i++) {
      const result = this.pathfinder.next(
        this.submarine.tile(),
        this.submarine.targetUnit()!.tile(),
        5,
      );
      switch (result.status) {
        case PathStatus.COMPLETE:
          this.submarine.owner().captureUnit(this.submarine.targetUnit()!);
          this.submarine.setTargetUnit(undefined);
          this.submarine.move(this.submarine.tile());
          return;
        case PathStatus.NEXT:
          this.submarine.move(result.node);
          break;
        case PathStatus.PENDING:
          this.submarine.touch();
          break;
        case PathStatus.NOT_FOUND: {
          console.log(`path not found to target`);
          break;
        }
      }
    }
  }

  private patrol() {
    if (this.submarine.targetTile() === undefined) {
      this.submarine.setTargetTile(this.randomTile());
      if (this.submarine.targetTile() === undefined) {
        return;
      }
    }

    const result = this.pathfinder.next(
      this.submarine.tile(),
      this.submarine.targetTile()!,
    );
    switch (result.status) {
      case PathStatus.COMPLETE:
        this.submarine.setTargetTile(undefined);
        this.submarine.move(result.node);
        break;
      case PathStatus.NEXT:
        this.submarine.move(result.node);
        break;
      case PathStatus.PENDING:
        this.submarine.touch();
        return;
      case PathStatus.NOT_FOUND: {
        console.log(`path not found to target`);
        break;
      }
    }
  }

  isActive(): boolean {
    return this.submarine?.isActive();
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  randomTile(allowShoreline: boolean = false): TileRef | undefined {
    let patrolRange = this.mg.config().warshipPatrolRange();
    const maxAttemptBeforeExpand: number = 500;
    let attempts: number = 0;
    let expandCount: number = 0;

    const component = this.mg.getWaterComponent(this.submarine.tile());

    while (expandCount < 3) {
      const x =
        this.mg.x(this.submarine.patrolTile()!) +
        this.random.nextInt(-patrolRange / 2, patrolRange / 2);
      const y =
        this.mg.y(this.submarine.patrolTile()!) +
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
      `Failed to find random tile for submarine for ${this.submarine.owner().name()}`,
    );
    if (!allowShoreline) {
      return this.randomTile(true);
    }
    return undefined;
  }
}
