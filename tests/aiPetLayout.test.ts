import { describe, expect, it } from 'vitest'
import { getPetFootprintForViewport } from '../src/components/AIPet'

describe('AI pet responsive footprint', () => {
  it('matches the mobile CSS footprint through the 720px boundary', () => {
    expect(getPetFootprintForViewport(390, 844)).toEqual({
      width: 64,
      height: 88,
      margin: 8,
    })
    expect(getPetFootprintForViewport(720, 900)).toEqual({
      width: 64,
      height: 88,
      margin: 8,
    })
  })

  it('switches to the compact desktop footprint at 721px and common desktop sizes', () => {
    expect(getPetFootprintForViewport(721, 900)).toEqual({ width: 64, height: 88, margin: 8 })
    expect(getPetFootprintForViewport(1920, 1080)).toEqual({ width: 64, height: 88, margin: 8 })
  })

  it('uses the full footprint only beyond both compact breakpoints', () => {
    expect(getPetFootprintForViewport(1921, 821)).toEqual({
      width: 176,
      height: 238,
      margin: 16,
    })
  })

  it('keeps the profile dock footprint independent of viewport size', () => {
    expect(getPetFootprintForViewport(390, 844, 'profile')).toEqual({
      width: 96,
      height: 130,
      margin: 8,
    })
  })
})
