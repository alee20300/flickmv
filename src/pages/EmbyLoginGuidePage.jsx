import { useEffect, useMemo, useState } from "react";

export default function EmbyLoginGuidePage({ settings, currentUser, subscriptions = [], plans = [] }) {
  const [guideSlideIndex, setGuideSlideIndex] = useState(0);
  const [guidePaused, setGuidePaused] = useState(false);

  const guideMedia = useMemo(
    () =>
      (settings?.embyGuideMedia && settings.embyGuideMedia.length > 0
        ? settings.embyGuideMedia
        : [
            { id: 1, label: "Step 1", src: "/emby-ios-1.png" },
            { id: 2, label: "Step 2", src: "/emby-ios-2.png" },
            { id: 3, label: "Step 3", src: "/emby-ios-3.png" },
          ]
      ).filter((media) => media.src),
    [settings?.embyGuideMedia]
  );

  useEffect(() => {
    setGuideSlideIndex(0);
  }, [guideMedia.length]);

  useEffect(() => {
    if (guidePaused || guideMedia.length <= 1) return;
    const timer = setInterval(() => {
      setGuideSlideIndex((prev) => (prev + 1) % guideMedia.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [guidePaused, guideMedia.length]);

  const goToGuideSlide = (index) => {
    if (!guideMedia.length) return;
    const safe = ((index % guideMedia.length) + guideMedia.length) % guideMedia.length;
    setGuideSlideIndex(safe);
  };

  return (
    <section className="card emby-guide-page">
      <div className="card-header">
        <h2>How To Login On Emby</h2>
        <div className="pill">guide</div>
      </div>

      {guideMedia.length > 0 && (
        <div
          className="emby-guide-carousel"
          onMouseEnter={() => setGuidePaused(true)}
          onMouseLeave={() => setGuidePaused(false)}
        >
          <div className="emby-guide-track-wrap">
            <div
              className="emby-guide-track"
              style={{ transform: `translateX(-${guideSlideIndex * 100}%)` }}
            >
              {guideMedia.map((media, idx) => (
                <figure key={`guide-media-page-${media.id || idx}`} className="emby-guide-slide">
                  <div className="emby-guide-image-step">
                    <span className="emby-guide-image-step-number">Step {idx + 1}</span>
                    <span className="emby-guide-image-step-text">
                      {(settings?.embyGuideSteps && settings.embyGuideSteps[idx]) ||
                        media.label ||
                        `Step ${idx + 1}`}
                    </span>
                  </div>
                  <img src={media.src} alt={media.label || "Emby guide"} loading="lazy" />
                </figure>
              ))}
            </div>
          </div>
          {guideMedia.length > 1 && (
            <div className="emby-guide-controls">
              <div className="emby-guide-dots">
                {guideMedia.map((media, idx) => (
                  <button
                    key={`guide-dot-page-${media.id || idx}`}
                    type="button"
                    className={`guide-dot ${idx === guideSlideIndex ? "active" : ""}`}
                    onClick={() => goToGuideSlide(idx)}
                    aria-label={`Go to guide image ${idx + 1}`}
                  />
                ))}
              </div>
              <div className="emby-guide-actions">
                <button className="btn ghost small emby-guide-prev" type="button" onClick={() => goToGuideSlide(guideSlideIndex - 1)}>
                  Prev
                </button>
                <button className="btn small emby-guide-next" type="button" onClick={() => goToGuideSlide(guideSlideIndex + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
