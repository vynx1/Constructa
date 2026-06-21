import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function LandingScrollReveal() {
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>('.reveal-section')
    const triggers: ScrollTrigger[] = []

    sections.forEach((el) => {
      gsap.set(el, { opacity: 0, y: 28 })

      const tween = gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.85,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none',
        },
      })

      if (tween.scrollTrigger) triggers.push(tween.scrollTrigger)
    })

    return () => {
      triggers.forEach((t) => t.kill())
    }
  }, [])

  return null
}
