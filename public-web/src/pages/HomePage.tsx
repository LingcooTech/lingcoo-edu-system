import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  MapPin,
  MessageCircle,
  RefreshCw,
  Search,
  Star,
  Target,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  loadHome,
  type BusinessModelSettings,
  type ContentItem,
  type Course,
  type HomePayload,
  type PublicTeacher,
  type TrialSession,
} from '@/api/client';
import { Layout } from '@/components/Layout';
import { formatDateTime, money } from '@/lib/utils';

function coursePriceLabel(course: Course, businessModel?: BusinessModelSettings) {
  if (
    !course.packageCount ||
    course.startingPriceAmount === null ||
    course.startingPriceAmount === undefined
  ) {
    return '可预约试听';
  }
  return businessModel?.onlinePackageSalesEnabled
    ? `${money(course.startingPriceAmount)} 起`
    : `${money(course.startingPriceAmount)} 参考`;
}

const highlightIconMap: Record<string, LucideIcon> = {
  'arrow-right': ArrowRight,
  'bar-chart-3': BarChart3,
  camera: Camera,
  'clipboard-list': ClipboardList,
  'map-pin': MapPin,
  'graduation-cap': GraduationCap,
  'message-circle': MessageCircle,
  'refresh-cw': RefreshCw,
  search: Search,
  star: Star,
  target: Target,
  'calendar-days': CalendarDays,
  'users-round': UsersRound,
};

function HighlightIcon({ icon }: { icon: string }) {
  const Icon = highlightIconMap[icon] ?? Star;
  return <Icon className="h-6 w-6" />;
}

export function HomePage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroContentHeight, setHeroContentHeight] = useState<number | null>(null);
  const heroTouchStartX = useRef<number | null>(null);
  const heroContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadHome()
      .then(setHome)
      .catch(() => undefined);
  }, []);

  const organization = home?.organization;
  const courses = home?.featuredCourses ?? [];
  const sessions = home?.trialSessions ?? [];
  const teachers = home?.teachers ?? [];
  const profile = organization?.publicProfile;
  const businessModel = organization?.businessModel;
  const highlights = profile?.highlights ?? [];
  const stats = profile?.stats ?? [];
  const contentItems = home?.contentItems ?? [];
  const growthLoop = profile?.growthLoop;
  const featuredTeachers = teachers.slice(0, 6);
  const heroImages = useMemo(
    () =>
      Array.from(
        new Set(
          (profile?.bannerImages?.length ? profile.bannerImages : [profile?.bannerImageUrl]).filter(
            (url): url is string => Boolean(url),
          ),
        ),
      ),
    [profile],
  );
  const activeHeroImage = heroImages[heroIndex % Math.max(heroImages.length, 1)];
  const heroGridStyle = heroContentHeight
    ? ({ '--home-hero-media-height': `${heroContentHeight}px` } as CSSProperties)
    : undefined;
  const growthLoopStyle = growthLoop
    ? {
        backgroundColor: growthLoop.backgroundColor || '#211f1c',
        backgroundImage: growthLoop.backgroundImageUrl
          ? `linear-gradient(rgba(20, 18, 15, 0.76), rgba(20, 18, 15, 0.82)), url(${growthLoop.backgroundImageUrl})`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined;

  useLayoutEffect(() => {
    const element = heroContentRef.current;
    if (!element) return undefined;

    const updateHeight = () => {
      const nextHeight = Math.ceil(element.getBoundingClientRect().height);
      setHeroContentHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    updateHeight();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateHeight);
    observer?.observe(element);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  useEffect(() => {
    setHeroIndex(0);
  }, [heroImages.length]);

  useEffect(() => {
    if (heroImages.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroImages.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [heroImages.length]);

  function moveHero(step: number) {
    if (heroImages.length <= 1) return;
    setHeroIndex((current) => (current + step + heroImages.length) % heroImages.length);
  }

  function onHeroTouchEnd(clientX: number) {
    if (heroTouchStartX.current === null) return;
    const deltaX = clientX - heroTouchStartX.current;
    heroTouchStartX.current = null;
    if (Math.abs(deltaX) < 40) return;
    moveHero(deltaX > 0 ? -1 : 1);
  }

  return (
    <Layout>
      <section className="border-line bg-surface border-b">
        <div className="container-narrow hero-grid home-hero-grid" style={heroGridStyle}>
          <div ref={heroContentRef}>
            <div className="eyebrow">{profile?.eyebrow || '儿童成长教室'}</div>
            <h1 className="text-ink mt-3 text-4xl leading-tight font-bold md:text-5xl">
              {profile?.bannerTitle || organization?.brandName || '儿童成长教室'}
            </h1>
            <p className="text-ink-soft mt-4 max-w-2xl text-base leading-8">
              {profile?.bannerSubtitle || '扫码或填表预约试听，老师会尽快联系确认上课时间。'}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to={profile?.ctaLink || '/register'}
                className="pwbtn pwbtn-primary transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
              >
                {profile?.ctaText || '预约试听'}
              </Link>
              <Link
                to={profile?.secondaryCtaLink || '/courses'}
                className="pwbtn pwbtn-outline group hover:border-brand/50 hover:bg-surface hover:text-brand transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
              >
                {profile?.secondaryCtaText || '浏览课程'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            {stats.length > 0 && (
              <div className="mt-5 hidden gap-3 sm:grid sm:grid-cols-3">
                {stats.map((item) => (
                  <div
                    key={item}
                    className="border-line text-ink rounded-2xl border bg-[#e7e1d8] px-4 py-3 text-center text-sm font-bold shadow-sm"
                  >
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div
            className="hero-media home-hero-media relative"
            onTouchStart={(event) => {
              heroTouchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => onHeroTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
            onTouchCancel={() => {
              heroTouchStartX.current = null;
            }}
          >
            {activeHeroImage ? (
              <img
                src={activeHeroImage}
                alt={organization?.brandName ?? '机构环境'}
                className="h-full w-full object-cover"
              />
            ) : null}
            {heroImages.length > 1 ? (
              <>
                <button
                  type="button"
                  className="text-ink absolute top-1/2 left-3 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-sm transition hover:bg-white md:flex"
                  onClick={() => moveHero(-1)}
                  aria-label="上一张"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="text-ink absolute top-1/2 right-3 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-sm transition hover:bg-white md:flex"
                  onClick={() => moveHero(1)}
                  aria-label="下一张"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute right-4 bottom-4 left-4 flex justify-center gap-2">
                  {heroImages.map((image, index) => (
                    <button
                      key={image}
                      type="button"
                      className={[
                        'h-1.5 rounded-full transition-all',
                        index === heroIndex % heroImages.length
                          ? 'w-7 bg-white'
                          : 'w-2 bg-white/60',
                      ].join(' ')}
                      onClick={() => setHeroIndex(index)}
                      aria-label={`第 ${index + 1} 张`}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {highlights.length > 0 && (
        <section className="container-narrow pt-5 pb-8">
          <div className="grid gap-3 md:grid-cols-3">
            {highlights.map((item) => {
              const title = item.title || item.text;
              const showDescription = Boolean(item.text && item.text !== title);
              return (
                <article
                  key={`${title}-${item.text}`}
                  className={[
                    'pwcard relative flex min-h-36 flex-col items-center justify-center overflow-hidden p-6 text-center',
                    item.imageUrl ? 'text-white' : '',
                  ].join(' ')}
                  style={
                    item.imageUrl
                      ? {
                          backgroundImage: `linear-gradient(rgba(20, 33, 27, 0.28), rgba(20, 33, 27, 0.68)), url(${item.imageUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : undefined
                  }
                >
                  <div
                    className={[
                      'flex h-12 w-12 items-center justify-center rounded-2xl',
                      item.imageUrl ? 'bg-white/20 text-white' : 'bg-brand-soft text-brand',
                    ].join(' ')}
                  >
                    <HighlightIcon icon={item.icon} />
                  </div>
                  <h3
                    className={[
                      'mt-4 text-base leading-7 font-bold md:text-lg',
                      item.imageUrl ? 'text-white drop-shadow-sm' : 'text-ink',
                    ].join(' ')}
                  >
                    {title}
                  </h3>
                  {showDescription ? (
                    <p
                      className={[
                        'mt-1.5 text-sm leading-6 font-medium',
                        item.imageUrl ? 'text-white/90 drop-shadow-sm' : 'text-ink-soft',
                      ].join(' ')}
                    >
                      {item.text}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="bg-[#eee8de] py-10">
        <div className="container-narrow">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-ink mt-1 text-xl font-bold">推荐课程</h2>
            </div>
            <Link to="/courses" className="text-brand inline-flex items-center gap-1 text-sm">
              查看全部
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {courses.map((course: Course) => (
              <Link
                key={course.id}
                to={`/courses/${course.slug}`}
                className="pwcard block overflow-hidden shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {course.coverImageUrl ? (
                  <div className="bg-brand-soft aspect-[16/9] overflow-hidden">
                    <img
                      src={course.coverImageUrl}
                      alt={course.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-ink text-sm font-semibold">{course.name}</div>
                      <div className="text-muted mt-1 text-xs">
                        {course.category} · {course.ageRange}
                      </div>
                    </div>
                    <div className="text-ink shrink-0 text-sm font-semibold">
                      {coursePriceLabel(course, businessModel)}
                    </div>
                  </div>
                  <p className="text-ink-soft mt-2 line-clamp-2 text-sm leading-6">
                    {course.summary}
                  </p>
                </div>
              </Link>
            ))}
            {courses.length === 0 && <p className="text-muted text-sm">课程即将上线</p>}
          </div>
        </div>

        <div className="container-narrow mt-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-ink mt-1 text-xl font-bold">本周公开课</h2>
            </div>
            <Link to="/trials" className="text-brand inline-flex items-center gap-1 text-sm">
              全部公开课
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {sessions.map((session: TrialSession) => (
              <Link
                key={session.id}
                to={`/trials/${session.id}`}
                className="pwcard block overflow-hidden shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {session.coverImageUrl ? (
                  <div className="bg-brand-soft aspect-[16/9] overflow-hidden">
                    <img
                      src={session.coverImageUrl}
                      alt={session.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="p-4">
                  <div className="text-ink text-sm font-semibold">{session.title}</div>
                  <div className="text-ink-soft mt-2 text-sm">
                    {formatDateTime(session.startsAt)}
                  </div>
                  <div className="text-muted mt-2 text-xs">
                    已报名 {session.bookedCount}/{session.capacity}
                  </div>
                  {session.reservationFeeAmount > 0 && (
                    <div className="mt-2 text-xs text-amber-700">
                      {money(session.reservationFeeAmount)} 试听席位保留费
                    </div>
                  )}
                </div>
              </Link>
            ))}
            {sessions.length === 0 && (
              <p className="text-muted text-sm">近期暂无公开课，可直接预约心仪课程的试听。</p>
            )}
          </div>
        </div>
      </section>

      {featuredTeachers.length > 0 && (
        <section className="container-narrow py-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-ink mt-1 text-xl font-bold">教师团队</h2>
            </div>
            <Link to="/teachers" className="text-brand inline-flex items-center gap-1 text-sm">
              查看全部
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="no-scrollbar flex snap-x gap-4 overflow-x-auto pb-2">
            {featuredTeachers.map((teacher) => (
              <HomeTeacherCard key={teacher.id} teacher={teacher} />
            ))}
          </div>
        </section>
      )}

      {contentItems.length > 0 && (
        <section className="container-narrow pb-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="section-title mt-1">{profile?.contentMarketingTitle || '成长故事'}</h2>
            </div>
            <Link to="/stories" className="text-brand inline-flex items-center gap-1 text-sm">
              查看全部
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {contentItems.slice(0, 3).map((story: ContentItem) => (
              <Link
                key={story.id}
                to={`/stories/${story.slug}`}
                className="pwcard group block overflow-hidden no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                {story.coverUrl ? (
                  <div className="bg-brand-soft aspect-[4/3] overflow-hidden">
                    <img
                      src={story.coverUrl}
                      alt={story.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                ) : null}
                <div className="p-5">
                  {story.authorName ? (
                    <div className="text-brand text-xs font-semibold">{story.authorName}</div>
                  ) : null}
                  <h3 className="text-ink mt-2 line-clamp-2 text-base leading-6 font-bold">
                    {story.title}
                  </h3>
                  <p className="text-ink-soft mt-3 line-clamp-3 text-sm leading-6">
                    {story.excerpt || story.content}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {growthLoop && (
        <section className="container-narrow pb-10">
          <div
            className="bg-ink grid gap-6 rounded-3xl p-5 text-white md:grid-cols-[0.8fr_1.2fr] md:p-7"
            style={growthLoopStyle}
          >
            <div>
              <div className="text-sm font-semibold text-white/55">{growthLoop.eyebrow}</div>
              <h2 className="mt-2 text-xl leading-tight font-bold md:text-2xl">
                {growthLoop.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/70">{growthLoop.summary}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                {growthLoop.primaryCtaText ? (
                  <SmartActionLink
                    to={growthLoop.primaryCtaLink || '/register'}
                    className="text-ink inline-flex items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    {growthLoop.primaryCtaText}
                  </SmartActionLink>
                ) : null}
                {growthLoop.secondaryCtaText && growthLoop.secondaryCtaLink ? (
                  <SmartActionLink
                    to={growthLoop.secondaryCtaLink}
                    className="inline-flex items-center justify-center rounded-full border border-white/25 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    {growthLoop.secondaryCtaText}
                  </SmartActionLink>
                ) : null}
              </div>
            </div>
            <div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
                {growthLoop.steps.map((item, index) => {
                  const Icon = highlightIconMap[item.icon] ?? Star;
                  return (
                    <div key={item.title} className="border-t border-white/18 pt-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/12 text-white">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="text-xs font-semibold text-white/40">
                          {String(index + 1).padStart(2, '0')}
                        </div>
                      </div>
                      <div className="mt-3 font-semibold text-white">{item.title}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}
    </Layout>
  );
}

function SmartActionLink({
  to,
  className,
  children,
}: {
  to: string;
  className: string;
  children: ReactNode;
}) {
  if (/^(https?:|tel:|mailto:)/i.test(to)) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link to={to || '/'} className={className}>
      {children}
    </Link>
  );
}

function HomeTeacherCard({ teacher }: { teacher: PublicTeacher }) {
  const specialties = teacher.specialties.slice(0, 2);
  const tagline = teacher.tagline?.trim() || specialties.join(' / ') || '查看老师档案与授课方向';

  return (
    <Link
      to={`/teachers/${teacher.id}`}
      className="group border-line bg-ink relative block h-96 w-72 shrink-0 snap-start overflow-hidden rounded-2xl border text-white shadow-sm select-none md:w-80"
      onContextMenu={(event) => event.preventDefault()}
      style={{ WebkitTouchCallout: 'none' }}
    >
      {teacher.avatarUrl ? (
        <img
          src={teacher.avatarUrl}
          alt={teacher.name}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="bg-brand-soft absolute inset-0 flex items-center justify-center">
          <GraduationCap className="text-brand h-16 w-16" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/12 to-transparent" />
      <div className="absolute right-0 bottom-0 left-0 hidden p-5 transition duration-300 md:block md:group-hover:translate-y-4 md:group-hover:opacity-0">
        <h3 className="text-2xl leading-tight font-bold">{teacher.name}</h3>
        <p className="mt-2 text-sm text-white/80">{teacher.title || '教师档案'}</p>
      </div>
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/68 via-black/28 to-transparent p-5 opacity-100 transition duration-300 md:translate-y-8 md:from-black/58 md:via-black/18 md:opacity-0 md:backdrop-blur-[1px] md:group-hover:translate-y-0 md:group-hover:opacity-100">
        <div>
          <h3 className="text-2xl leading-tight font-bold">{teacher.name}</h3>
          <p className="mt-2 text-sm text-white/75">{teacher.title || '教师档案'}</p>
          <p className="mt-5 line-clamp-4 text-sm leading-7 text-white/85">{tagline}</p>
          {specialties.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {specialties.map((item) => (
                <span
                  key={item}
                  className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-white">
            查看老师档案
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
