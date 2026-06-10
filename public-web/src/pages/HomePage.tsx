import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  MapPin,
  MessageCircle,
  Phone,
  School,
  Star,
} from 'lucide-react';

import {
  loadHome,
  type BusinessModelSettings,
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

function uniqueStrings(values: Array<string | null | undefined>, limit: number) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  ).slice(0, limit);
}

export function HomePage() {
  const [home, setHome] = useState<HomePayload | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    loadHome()
      .then(setHome)
      .catch(() => undefined);
  }, []);

  const organization = home?.organization;
  const courses = home?.featuredCourses ?? [];
  const sessions = home?.trialSessions ?? [];
  const teachers = home?.teachers ?? [];
  const campuses = home?.campuses ?? [];
  const classrooms = home?.classrooms ?? [];
  const profile = organization?.publicProfile;
  const businessModel = organization?.businessModel;
  const highlights = profile?.highlights ?? [];
  const stats = profile?.stats ?? [];
  const testimonials = profile?.testimonials ?? [];
  const featuredTeachers = teachers.slice(0, 2);
  const teacherById = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers],
  );
  const courseTeacherNames = useMemo(
    () =>
      uniqueStrings(
        courses.map((course) =>
          course.defaultTeacherId ? teacherById.get(course.defaultTeacherId)?.name : undefined,
        ),
        3,
      ),
    [courses, teacherById],
  );
  const teachingLocations = useMemo(
    () =>
      uniqueStrings(
        [
          ...courses.map((course) => course.teachingLocationLabel),
          ...campuses.map((campus) => campus.address || campus.name),
        ],
        4,
      ),
    [campuses, courses],
  );
  const showTeamSection =
    teachers.length > 0 || campuses.length > 0 || classrooms.length > 0 || teachingLocations.length > 0;
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

  return (
    <Layout>
      <section className="border-line bg-surface border-b">
        <div className="container-narrow hero-grid">
          <div>
            <div className="eyebrow">{profile?.eyebrow || '儿童成长教室'}</div>
            <h1 className="text-ink mt-4 text-4xl leading-tight font-bold tracking-tight md:text-5xl">
              {profile?.bannerTitle || organization?.brandName || '儿童成长教室'}
            </h1>
            <p className="text-ink-soft mt-5 max-w-2xl text-base leading-8">
              {profile?.bannerSubtitle || '扫码或填表预约试听，老师会尽快联系确认上课时间。'}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={profile?.ctaLink || '/register'} className="pwbtn pwbtn-primary">
                {profile?.ctaText || '预约试听'}
              </Link>
              <Link to={profile?.secondaryCtaLink || '/courses'} className="pwbtn pwbtn-outline">
                {profile?.secondaryCtaText || '浏览课程'}
              </Link>
            </div>
            {stats.length > 0 && (
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {stats.map((item) => (
                  <div key={item} className="bg-paper rounded-2xl px-4 py-3 text-sm font-semibold">
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="hero-media relative">
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
                  className="text-ink absolute top-1/2 left-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-sm transition hover:bg-white"
                  onClick={() => moveHero(-1)}
                  aria-label="上一张"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="text-ink absolute top-1/2 right-3 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-sm transition hover:bg-white"
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
        <section className="container-narrow py-8">
          <div className="grid gap-3 md:grid-cols-3">
            {highlights.map((item, index) => (
              <article key={item} className="pwcard p-5">
                <div className="bg-brand-soft text-brand flex h-10 w-10 items-center justify-center rounded-2xl">
                  {index === 0 ? (
                    <Star className="h-5 w-5" />
                  ) : index === 1 ? (
                    <CalendarDays className="h-5 w-5" />
                  ) : (
                    <MessageCircle className="h-5 w-5" />
                  )}
                </div>
                <p className="text-ink-soft mt-4 text-sm leading-6">{item}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Featured courses */}
      <section className="container-narrow py-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="eyebrow">Courses</div>
            <h2 className="text-ink mt-1 text-xl font-bold">推荐课程</h2>
          </div>
          <Link to="/courses" className="text-brand inline-flex items-center gap-1 text-sm">
            查看全部
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {courses.map((course: Course) => (
            <Link key={course.id} to={`/courses/${course.slug}`} className="pwcard block p-4">
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
              <p className="text-ink-soft mt-2 line-clamp-2 text-sm leading-6">{course.summary}</p>
            </Link>
          ))}
          {courses.length === 0 && <p className="text-muted text-sm">课程即将上线</p>}
        </div>
      </section>

      {/* This week's public classes */}
      <section className="container-narrow pb-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="eyebrow">Trial</div>
            <h2 className="text-ink mt-1 text-xl font-bold">本周公开课</h2>
          </div>
          <Link to="/trials" className="text-brand inline-flex items-center gap-1 text-sm">
            全部公开课
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {sessions.map((session: TrialSession) => (
            <Link key={session.id} to={`/trials/${session.id}`} className="pwcard block p-4">
              <div className="text-ink text-sm font-semibold">{session.title}</div>
              <div className="text-ink-soft mt-2 text-sm">{formatDateTime(session.startsAt)}</div>
              <div className="text-muted mt-2 text-xs">
                已报名 {session.bookedCount}/{session.capacity}
              </div>
              {session.reservationFeeAmount > 0 && (
                <div className="mt-2 text-xs text-amber-700">
                  {money(session.reservationFeeAmount)} 试听席位保留费
                </div>
              )}
            </Link>
          ))}
          {sessions.length === 0 && (
            <p className="text-muted text-sm">近期暂无公开课，可直接预约心仪课程的试听。</p>
          )}
        </div>
      </section>

      {showTeamSection && (
        <section className="container-narrow pb-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Team</div>
              <h2 className="text-ink mt-1 text-xl font-bold">师资与教学环境</h2>
            </div>
            <Link to="/teachers" className="text-brand inline-flex items-center gap-1 text-sm">
              教师团队
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {featuredTeachers.map((teacher) => (
              <HomeTeacherCard key={teacher.id} teacher={teacher} />
            ))}
            <article className="pwcard p-5">
              <div className="bg-brand-soft text-brand flex h-10 w-10 items-center justify-center rounded-2xl">
                <School className="h-5 w-5" />
              </div>
              <h3 className="text-ink mt-4 text-sm font-semibold">校区与教室</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <b className="text-ink block text-lg">{campuses.length || '-'}</b>
                  <span className="text-muted">校区</span>
                </div>
                <div>
                  <b className="text-ink block text-lg">{classrooms.length || '-'}</b>
                  <span className="text-muted">教室</span>
                </div>
              </div>
              {courseTeacherNames.length > 0 ? (
                <p className="text-ink-soft mt-4 text-sm leading-6">
                  {courseTeacherNames.join('、')} 等老师参与授课。
                </p>
              ) : null}
              {teachingLocations.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {teachingLocations.map((item) => (
                    <span key={item} className="chip">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          </div>
        </section>
      )}

      {testimonials.length > 0 && (
        <section className="container-narrow pb-10">
          <div className="mb-4">
            <div className="eyebrow">Testimonials</div>
            <h2 className="section-title mt-1">家长评价</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {testimonials.slice(0, 4).map((item) => (
              <blockquote key={item} className="pwcard text-ink-soft p-5 text-sm leading-7">
                “{item}”
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <section className="container-narrow pb-10">
        <div className="bg-ink grid gap-4 rounded-[2rem] p-6 text-white md:grid-cols-2 md:p-8">
          <div>
            <div className="text-sm font-semibold text-white/60">Visit</div>
            <h2 className="mt-2 text-2xl font-bold">到店前先预约，老师会确认适合的班型</h2>
          </div>
          <div className="space-y-3 text-sm text-white/80">
            {organization?.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {organization.address}
              </div>
            )}
            {organization?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                {organization.phone}
              </div>
            )}
            {profile?.businessHours && <div>{profile.businessHours}</div>}
          </div>
        </div>
      </section>
    </Layout>
  );
}

function HomeTeacherCard({ teacher }: { teacher: PublicTeacher }) {
  const specialties = teacher.specialties.slice(0, 2);

  return (
    <Link to={`/teachers/${teacher.id}`} className="pwcard pwcard-hover block overflow-hidden">
      <div className="bg-brand-soft flex aspect-[16/10] items-center justify-center overflow-hidden">
        {teacher.avatarUrl ? (
          <img src={teacher.avatarUrl} alt={teacher.name} className="h-full w-full object-cover" />
        ) : (
          <GraduationCap className="text-brand h-10 w-10" />
        )}
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-ink truncate text-sm font-semibold">{teacher.name}</h3>
            <p className="text-muted mt-1 truncate text-xs">{teacher.title || '教师档案'}</p>
          </div>
          <ArrowRight className="text-muted h-4 w-4 shrink-0" />
        </div>
        <p className="text-ink-soft mt-3 line-clamp-2 min-h-11 text-sm leading-6">
          {teacher.tagline?.trim() || specialties.join(' / ') || '查看老师档案与授课方向'}
        </p>
        {specialties.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {specialties.map((item) => (
              <span key={item} className="chip">
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
