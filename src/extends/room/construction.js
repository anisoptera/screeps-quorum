'use strict'

global.SEGMENT_CONSTRUCTION = 'construction'

/* Room layouts are critical information so we want this segment available at all times */
sos.lib.vram.markCritical(SEGMENT_CONSTRUCTION)


global.STRUCTURE_LOADER = 'loader'
global.STRUCTURE_CRANE = 'crane'
var structureMap = [
  false,
  'spawn',
  'extension',
  'road',
  'constructedWall',
  'rampart',
  'link',
  'container',
  'tower',
  'lab',
  'observer',
  'powerSpawn',
  'extractor',
  'storage',
  'terminal',
  'nuker',
  'loader',
  'crane'
]


var structures = Object.keys(CONTROLLER_STRUCTURES)
var skipStructures = [
  STRUCTURE_ROAD,
  STRUCTURE_WALL,
  STRUCTURE_RAMPART,
  STRUCTURE_CONTAINER
]
global.LEVEL_BREAKDOWN = {}
for (var structure of structures) {
  if (skipStructures.indexOf(structure) !== -1) {
    continue
  }
  var levels = Object.keys(CONTROLLER_STRUCTURES[structure])
  for (var level of levels) {
    if(!LEVEL_BREAKDOWN[level]) {
      LEVEL_BREAKDOWN[level] = {}
    }
    LEVEL_BREAKDOWN[level][structure] = CONTROLLER_STRUCTURES[structure][level]
  }
}

Room.prototype.constructNextMissingStructure = function () {
  var structureType = this.getNextMissingStructureType()
  if (!structureType) {
    return false
  }

  // Extractors are always built in minerals and thus aren't planned.
  if (structureType === STRUCTURE_EXTRACTOR) {
    var minerals = this.find(FIND_MINERALS)
    if(minerals.length <= 0) {
      return false
    }
    return this.createConstructionSite(minerals[0].pos, STRUCTURE_EXTRACTOR)
  }

  // Get room layout, if it exists, and use that to get structure positions.
  var layout = this.getLayout()
  if (!layout.isPlanned()) {
    return false
  }
  var allStructurePositions = layout.getAllStructures()
  if (!allStructurePositions[structureType]) {
    return false
  }

  var structurePositions = _.filter(allStructurePositions[structureType], function (position) {
    var structures = position.lookFor(LOOK_STRUCTURES)
    if (!structures || structures.length <= 0) {
      return true
    }
    for (var structure of structures) {
      if(structure.structureType == structureType) {
        return false
      }
    }
    return true
  })

  // Prioritize structures based on distance to storage- closer ones get built first.
  if (allStructurePositions[STRUCTURE_STORAGE]) {
    var storagePosition = allStructurePositions[STRUCTURE_STORAGE][0]
    structurePositions.sort(function (a,b) {
      return a.getManhattanDistance(storagePosition) - b.getManhattanDistance(storagePosition)
    })
  }
  return this.createConstructionSite(structurePositions[0], structureType)
}

Room.prototype.getNextMissingStructureType = function () {
  if (!this.isMissingStructures()) {
    return false
  }
  var structureCount = this.getStructureCount()
  var nextLevel = this.getPracticalRoomLevel()+1
  var nextLevelStructureCount = LEVEL_BREAKDOWN[nextLevel]
  var structures = Object.keys(nextLevelStructureCount)
  for (var structureType of structures) {
    if (skipStructures.indexOf(structureType) !== -1 || structureType == STRUCTURE_LINK) {
      continue
    }
    if (!structureCount[structureType] || structureCount[structureType] < nextLevelStructureCount[structureType]) {
      return structureType
    }
  }
  return false
}

Room.prototype.isMissingStructures = function () {
  return this.getPracticalRoomLevel() < this.controller.level
}

Room.prototype.getStructureCount = function () {
  var structures = this.find(FIND_MY_STRUCTURES)
  var counts = {}
  for (var structure of structures) {
    if(!counts[structure.structureType]) {
      counts[structure.structureType] = 0
    }
    counts[structure.structureType]++
  }
  return counts
}

Room.prototype.getPracticalRoomLevel = function () {
  if(this.__level) {
    return this.__level
  }
  var structureCount = this.getStructureCount()
  for (var level = 1; level < 8; level++) {
    var neededStructures = Object.keys(LEVEL_BREAKDOWN[level+1])
    for (var structureType of neededStructures) {
      if (structureType === STRUCTURE_LINK) {
        continue
      }
      if (LEVEL_BREAKDOWN[level+1][structureType] > 0) {
        if (!structureCount[structureType] || structureCount[structureType] < LEVEL_BREAKDOWN[level+1][structureType]) {
          this.__level = level
          return level
        }
      }
    }
  }
  this.__level = 8
  return 8
}


Room.getLayout = function (roomname) {
  return new RoomLayout(roomname)
}

Room.prototype.getLayout = function () {
  return Room.getLayout(this.name)
}


class RoomLayout {
  constructor (roomname) {
    this.roomname = roomname
    this.allStructures = false
  }

  planStructureAt (structureType, x, y, overrideRoads = false) {
    var currentStructure = this.getStructureAt(x, y)
    if(!!currentStructure) {
      if(!overrideRoads || currentStructure != STRUCTURE_ROAD) {
        return false
      }
    }
    var structureId = structureMap.indexOf(structureType)
    if(structureId < 1) {
      throw new Error('Unable to map structure to id for structure type ' + structureType)
    }
    var map = this._getStructureMap()
    map.set(x, y, structureId)
    if(!!this.allStructures) {
      if(!this.allStructures[structureType]) {
        this.allStructures[structureType] = []
      }
      this.allStructures[structureType].push(new RoomPosition(x, y, this.roomname))
    }
    return true
  }

  getStructureAt (x, y) {
    var map = this._getStructureMap()
    var structureId = map.get(x, y)
    if (!structureMap[structureId]) {
      return false
    }
    return structureMap[structureId]
  }

  getAllStructures () {
    if(!this.allStructures) {
      this.allStructures = {}
      for (var x = 0; x < 50; x++) {
        for (var y = 0; y < 50; y++) {
          var structure = this.getStructureAt(x, y)
          if(!!structure) {
            if(!this.allStructures[structure]) {
              this.allStructures[structure] = []
            }
            this.allStructures[structure].push(new RoomPosition(x, y, this.roomname))
          }
        }
      }
    }
    return this.allStructures
  }

  clear () {
    this.allStructures = false
    this.structureMap = new PathFinder.CostMatrix()
  }

  save () {
    var map = this._getStructureMap()
    var globalmap = sos.lib.vram.getData(SEGMENT_CONSTRUCTION)
    globalmap[this.roomname] = map.serialize()
    sos.lib.vram.markDirty(SEGMENT_CONSTRUCTION)
    this.unplanned = true
  }

  isPlanned () {
    this._getStructureMap()
    return !this.unplanned
  }

  visualize () {
    var structures = this.getAllStructures()
    var types = Object.keys(structures)
    var visual = new RoomVisual(this.roomname)
    for (var type of types) {
      for (var structure_pos of structures[type]) {
        visual.structure(structure_pos.x, structure_pos.y, type, {'opacity': 0.60})
      }
    }
  }

  _getStructureMap () {
    if(!this.structureMap) {
      var map = sos.lib.vram.getData(SEGMENT_CONSTRUCTION)
      if (Number.isInteger(map)) {
        throw new Error('Room structure maps are not available')
      }
      if(!!map[this.roomname]) {
        this.structureMap = PathFinder.CostMatrix.deserialize(map[this.roomname])
        this.unplanned = false
      } else {
        this.structureMap = new PathFinder.CostMatrix()
        this.unplanned = true
      }
    }
    return this.structureMap
  }
}
