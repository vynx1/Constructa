import { useCallback, useState } from 'react'
import { Heart, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import type { LandListing } from '~/lib/mapClient'

interface Props {
  listings: LandListing[]
  likedIds: Set<string>
  onToggleLike: (listing: LandListing) => void
}

function hasDisplayableImage(listing: LandListing, broken: Set<string>, index: number): boolean {
  if (listing.imageUnavailable) return false
  const url = listing.images[index]
  if (!url?.startsWith('http')) return false
  if (broken.has(`${listing.id}:${index}`)) return false
  return true
}

export function PlotCarousel({ listings, likedIds, onToggleLike }: Props) {
  const [plot, setPlot] = useState(0)
  const [img, setImg] = useState(0)
  const [broken, setBroken] = useState<Set<string>>(() => new Set())

  const markBroken = useCallback((listingId: string, index: number) => {
    setBroken((prev) => {
      const next = new Set(prev)
      next.add(`${listingId}:${index}`)
      return next
    })
  }, [])

  if (!listings.length) {
    return <p className="deep-dive__empty">No parcels indexed for this district yet.</p>
  }

  const active = listings[Math.min(plot, listings.length - 1)]!
  const liked = likedIds.has(active.id)
  const showImage = hasDisplayableImage(active, broken, img)
  const imageCount = active.images.filter((_, i) => hasDisplayableImage(active, broken, i)).length

  const go = (dir: number) => {
    setPlot((p) => (p + dir + listings.length) % listings.length)
    setImg(0)
  }

  return (
    <div className="carousel">
      <div className="carousel__stage">
        {showImage ? (
          <img
            className="carousel__img"
            src={active.images[img]}
            alt={active.title}
            loading="lazy"
            onError={() => markBroken(active.id, img)}
          />
        ) : (
          <div className="carousel__noimg" role="img" aria-label="No verified image available">
            <svg viewBox="0 0 120 80" width="120" height="80" aria-hidden="true">
              <rect
                x="6"
                y="6"
                width="108"
                height="68"
                rx="3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <path
                d="M6 56 L40 36 L64 50 L88 30 L114 46"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.5"
              />
              <circle cx="92" cy="22" r="6" fill="currentColor" opacity="0.35" />
            </svg>
            <span>
              {active.imageUnavailable
                ? 'No verified photo — open Zillow or LandWatch below'
                : `Photo unavailable · ${active.acreage}`}
            </span>
          </div>
        )}

        <button
          className="carousel__nav carousel__nav--prev"
          onClick={() => go(-1)}
          aria-label="Previous plot"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          className="carousel__nav carousel__nav--next"
          onClick={() => go(1)}
          aria-label="Next plot"
        >
          <ChevronRight size={20} />
        </button>

        <button
          className={'carousel__like' + (liked ? ' carousel__like--on' : '')}
          onClick={() => onToggleLike(active)}
          aria-label={liked ? 'Remove from liked plots' : 'Save to liked plots'}
        >
          <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
          {liked ? 'Saved' : 'Save plot'}
        </button>

        <div className="carousel__price-tag">{active.price}</div>

        {imageCount > 1 && (
          <div className="carousel__dots">
            {active.images.map((_, i) =>
              hasDisplayableImage(active, broken, i) ? (
                <button
                  key={i}
                  className={'carousel__dot' + (i === img ? ' carousel__dot--on' : '')}
                  onClick={() => setImg(i)}
                  aria-label={`Image ${i + 1}`}
                />
              ) : null,
            )}
          </div>
        )}
      </div>

      <div className="carousel__meta">
        <div className="carousel__title-row">
          <h4>{active.title}</h4>
          <span className="carousel__zip">
            <MapPin size={13} /> {active.zip}
          </span>
        </div>
        <div className="carousel__chips">
          <span className="chip">{active.acreage}</span>
          <span className="chip">{active.pricePerAcre}</span>
          <span className="chip chip--zone">{active.zone}</span>
        </div>
        <div className="carousel__sources">
          {active.sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className={
                s.title.toLowerCase().includes('zillow') ? 'carousel__source--zillow' : undefined
              }
            >
              {s.title}
            </a>
          ))}
        </div>
      </div>

      <div className="carousel__thumbs">
        {listings.map((l, i) => {
          const thumbOk = hasDisplayableImage(l, broken, 0)
          return (
            <button
              key={l.id}
              className={'carousel__thumb' + (i === plot ? ' carousel__thumb--on' : '')}
              onClick={() => {
                setPlot(i)
                setImg(0)
              }}
            >
              {thumbOk ? (
                <img
                  src={l.images[0]}
                  alt={l.title}
                  loading="lazy"
                  onError={() => markBroken(l.id, 0)}
                />
              ) : (
                <span className="carousel__thumb-noimg">No img</span>
              )}
              {likedIds.has(l.id) && (
                <span className="carousel__thumb-heart">
                  <Heart size={11} fill="currentColor" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
