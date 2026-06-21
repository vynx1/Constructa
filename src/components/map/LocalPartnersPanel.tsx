import { useCallback, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Star, Phone, Globe, MapPin, BadgeCheck, Loader2 } from 'lucide-react'
import { mapClient, type BusinessPartner } from '~/lib/mapClient'

// Local Partners — vertical, infinite-scroll list of BrowserBase-sourced local
// contractors & businesses (reviews + contact) for the active region. Sits in a
// tab beneath the property photos. Uses an IntersectionObserver sentinel to load
// the next cursor page as the user scrolls (no horizontal carousel).

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <span className="partner-card__stars" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={13}
          fill={i < full ? 'currentColor' : 'none'}
          strokeWidth={i < full ? 0 : 1.5}
        />
      ))}
    </span>
  )
}

function PartnerCard({ p }: { p: BusinessPartner }) {
  const initials = p.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return (
    <article className="partner-card">
      <div className="partner-card__logo">
        {p.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo} alt="" loading="lazy" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="partner-card__body">
        <div className="partner-card__head">
          <h4 className="partner-card__name">
            {p.name}
            {p.reviewCount >= 100 ? (
              <BadgeCheck size={14} className="partner-card__verified" />
            ) : null}
          </h4>
          <span className="partner-card__cat">{p.category}</span>
        </div>
        <div className="partner-card__rating">
          <Stars rating={p.rating} />
          <span className="partner-card__rating-num">{p.rating.toFixed(1)}</span>
          <span className="partner-card__reviews">({p.reviewCount.toLocaleString()})</span>
        </div>
        {p.topReview ? (
          <p className="partner-card__review">&ldquo;{p.topReview}&rdquo;</p>
        ) : null}
        <div className="partner-card__footer">
          {p.phone ? (
            <a className="partner-card__chip" href={`tel:${p.phone.replace(/[^+\d]/g, '')}`}>
              <Phone size={12} /> {p.phone}
            </a>
          ) : null}
          {p.website ? (
            <a
              className="partner-card__chip"
              href={p.website}
              target="_blank"
              rel="noreferrer"
            >
              <Globe size={12} /> Website
            </a>
          ) : null}
          {p.address ? (
            <span className="partner-card__chip partner-card__chip--muted">
              <MapPin size={12} /> {p.address}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function LocalPartnersPanel({
  regionId,
  live = false,
}: {
  regionId: string
  live?: boolean
}) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['partners', regionId, live],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => mapClient.partners(regionId, pageParam as number, { live }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!regionId,
  })

  const partners = data?.pages.flatMap((pg) => pg.partners) ?? []
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(onIntersect, { rootMargin: '160px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [onIntersect])

  if (isLoading) {
    return (
      <div className="partner-list partner-list--state">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="partner-card partner-card--skeleton" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="partner-list partner-list--state">
        <p className="partner-list__msg">Could not load local partners. Try again shortly.</p>
      </div>
    )
  }

  if (!partners.length) {
    return (
      <div className="partner-list partner-list--state">
        <p className="partner-list__msg">No local partners found for this area yet.</p>
      </div>
    )
  }

  return (
    <div className="partner-list">
      {partners.map((p) => (
        <PartnerCard key={p.id} p={p} />
      ))}
      <div ref={sentinelRef} className="partner-list__sentinel">
        {isFetchingNextPage ? (
          <span className="partner-list__loading">
            <Loader2 size={14} className="spin" /> Loading more…
          </span>
        ) : !hasNextPage ? (
          <span className="partner-list__end">You&rsquo;ve reached the end</span>
        ) : null}
      </div>
    </div>
  )
}
