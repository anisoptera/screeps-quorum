/**
 * Provide Room-level Security
 */

class CityDefense extends kernel.process {
  getDescriptor () {
    return this.data.room
  }

  main () {
    if (!Game.rooms[this.data.room]) {
      return this.suicide()
    }

    const room = Game.rooms[this.data.room]

    let towers = sos.lib.cache.getOrUpdate(
      [this.data.room, 'towers'],
      { persist: true, maxttl: 5000, chance: 0.01 },
      () => room.find(FIND_MY_STRUCTURES, s => s.structureType === STRUCTURE_TOWER))

    const hostiles = room.find(FIND_HOSTILE_CREEPS)

    if (towers && towers.length > 0) {
      this.fireTowers(towers, hostiles)
    }

    const playerHostiles = hostiles.filter(c => c.owner.username !== 'Invader')
    if (playerHostiles.length > 0) {
      Logger.log(`Hostile creep owned by ${c.owner.username} detected in room ${this.data.room}.`, LOG_WARN)
      this.safeMode(playerHostiles)
    }
  }

  fireTowers (towers, hostiles) {
    if (hostiles.length > 0) {
      // for now, just shoot closest for each tower
      for (let tower of towers) {
        if (tower.energy < TOWER_ENERGY_COST) {
          continue
        }
        const closest = _.min(hostiles, c => c.pos.getRangeTo(tower.pos))
        tower.attack(closest)
      }
      return
    }

    const healFunc = (healTarget) => {
      // TODO: clever calculations to avoid overheals
      for (let tower of towers) {
        tower.heal(healTarget)
      }
    }

    if (this.data.healTarget !== undefined) {
      const healTarget = Game.getObjectById(this.data.healTarget)
      if (healTarget &&
          (healTarget.pos.room.name === this.data.room) &&
          (healTarget.hits < healTarget.hitsMax)) {
        healFunc(healTarget)
        return
      }

      // heal target no longer valid
      delete this.data.healTarget
    }

    // look for a heal target every healFrequency ticks
    const healFrequency = 5
    if (this.period(healFrequency, "healTargetSelection")) {
      const myCreeps = towers[0].pos.room.find(FIND_MY_CREEPS)
      const lowestCreep = _.min(myCreeps, c => c.hits / c.hitsMax)
      if (!_.isNumber(lowestCreep) &&
          (lowestCreep.hits < lowestCreep.hitsMax)) {
        this.data.healTarget = lowestCreep.id
        healFunc(lowestCreep)
        return
      }
    }
  }

  safeMode (hostiles) {
    var room = Game.rooms[this.data.room]
    if (room.controller.safeMode && room.controller.safeMode > 0) {
      return true
    }
    if (room.controller.safeModeAvailable <= 0) {
      return false
    }
    if (room.controller.safeModeCooldown) {
      return false
    }

    var spawns = room.find(FIND_MY_SPAWNS)
    for(var spawn of spawns) {
      var closest = spawn.pos.findClosestByRange(hostiles)
      if(spawn.pos.getRangeTo(closest) < 5) {
        // Trigger safemode
        Logger.log('Activating safemode in ' + this.data.room, LOG_ERROR)
        room.controller.activateSafeMode()
        return true
      }
    }
    return false
  }
}

module.exports = CityDefense
