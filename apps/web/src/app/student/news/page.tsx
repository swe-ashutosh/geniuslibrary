"use client";

/**
 * [WEB • PAGE] News & Announcements Feed
 *
 * (Small helper file — see code comments below.)
 */
import { useState } from "react";
import { BRAND_CONFIG } from "@/lib/config";
import { 
  Newspaper, 
  ExternalLink, 
  Search, 
  Calendar, 
  Clock, 
  ArrowRight, 
  Sparkles, 
  BookOpen, 
  Compass, 
  TrendingUp,
  Tag,
  Share2,
  Bookmark
} from "lucide-react";

interface BlogPost {
  id: string;
  title: string;
  category: "Exams" | "Study Tips" | "Library News" | "Current Affairs";
  excerpt: string;
  author: string;
  authorRole: string;
  readTime: string;
  date: string;
  imageUrl: string;
  featured?: boolean;
  link?: string;
}

const BLOG_POSTS: BlogPost[] = [
  {
    id: "blog-1",
    title: "10 Proven Daily Habits of UPSC & State PSC Toppers Studying in Digital Libraries",
    category: "Study Tips",
    excerpt: "Discover the scientifically-backed daily routine, active recall strategies, and disciplined silent reading methods that helped our students crack top competitive exams.",
    author: "Ashutosh Sharma",
    authorRole: "Library Director",
    readTime: "5 min read",
    date: "Sep 25, 2026",
    imageUrl: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=80",
    featured: true,
    link: "https://blogs.jugaduji.com",
  },
  {
    id: "blog-2",
    title: `Weekly Mock Test Series Announced at ${BRAND_CONFIG.fullName}`,
    category: "Library News",
    excerpt: "Join the full-length OMR & CBT mock tests organized every Sunday at our Madhupur campus with instant All-India percentile analysis and rank lists.",
    author: `${BRAND_CONFIG.shortName} Exam Cell`,
    authorRole: "Academic Coordinator",
    readTime: "3 min read",
    date: "Sep 24, 2026",
    imageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80",
    link: "https://blogs.jugaduji.com",
  },
  {
    id: "blog-3",
    title: "Mastering Indian Polity & Modern History: 90-Day Comprehensive Strategy",
    category: "Exams",
    excerpt: "A structured timeline for finishing Laxmikanth Polity and Spectrum Modern India with concise revision mindmaps and chapter-wise question practice.",
    author: "Editorial Team",
    authorRole: "Competitive Exam Mentor",
    readTime: "7 min read",
    date: "Sep 21, 2026",
    imageUrl: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=800&q=80",
    link: "https://blogs.jugaduji.com",
  },
  {
    id: "blog-4",
    title: "Monthly Current Affairs Capsule: Key National & International Highlights",
    category: "Current Affairs",
    excerpt: "Handpicked economic updates, government schemes, science & technology breakthroughs, and international summits relevant for upcoming government recruitment exams.",
    author: "Jugadu Ji Research",
    authorRole: "Editorial Desk",
    readTime: "6 min read",
    date: "Sep 18, 2026",
    imageUrl: "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=800&q=80",
    link: "https://blogs.jugaduji.com",
  },
  {
    id: "blog-5",
    title: "Why Deep Work & High-Focus Cubicles Double Retention for Aspirants",
    category: "Study Tips",
    excerpt: "Understand how noise-insulated individual library cubicles and digital focus timers eliminate cognitive fatigue and supercharge learning retention.",
    author: "Ashutosh Sharma",
    authorRole: "Founder",
    readTime: "4 min read",
    date: "Sep 15, 2026",
    imageUrl: "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=800&q=80",
    link: "https://blogs.jugaduji.com",
  },
  {
    id: "blog-6",
    title: "Weekly Mock Test Series Schedule & Syllabus Breakdown",
    category: "Exams",
    excerpt: "The complete timetable for upcoming BPSC, SSC CGL and Police Constable offline mock exams with OMR evaluation and official answer keys.",
    author: "Examination Cell",
    authorRole: "Test Desk In-charge",
    readTime: "4 min read",
    date: "Sep 10, 2026",
    imageUrl: "https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?auto=format&fit=crop&w=800&q=80",
    link: "https://blogs.jugaduji.com",
  }
];

export default function StudentNewsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredPosts = BLOG_POSTS.filter((post) => {
    const matchesCategory = selectedCategory === "All" || post.category === selectedCategory;
    const matchesSearch = 
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const featuredPost = BLOG_POSTS.find((p) => p.featured) || BLOG_POSTS[0];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* 1. Header Banner & Explore Button */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-[#0A2E5C] via-[#242F42] to-[#141A24] p-6 sm:p-8 text-white shadow-md border border-[#FFC107]/30">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-[#FFC107]/10 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1 text-xs font-bold text-[#FFC107] backdrop-blur-xs border border-white/10">
              <Sparkles className="h-3.5 w-3.5 text-[#FFC107]" />
              <span>Jugadu Ji Educational & News Hub</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Library News & Knowledge Blogs
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Stay ahead with curated competitive exam strategies, syllabus breakdowns, study tips, and campus announcements.
            </p>
          </div>

          {/* Explore Button Redirecting to https://blogs.jugaduji.com */}
          <div className="shrink-0">
            <a
              href="https://blogs.jugaduji.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-2xl bg-linear-to-r from-[#0B5ED7] to-[#FFC107] px-6 py-3.5 text-xs sm:text-sm font-black text-[#0A2E5C] shadow-lg shadow-[#0B5ED7]/25 hover:opacity-95 transition-all transform active:scale-95 cursor-pointer"
            >
              <span>Explore All Blogs</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {/* 2. Search & Category Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#0A2E5C] p-3 sm:p-4 rounded-2xl border border-[#E5E7EB]/70 dark:border-zinc-800 shadow-xs">
        {/* Categories */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {["All", "Exams", "Study Tips", "Library News", "Current Affairs"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? "bg-[#0A2E5C] text-[#FFC107] border border-[#FFC107]/40 dark:bg-white dark:text-[#0A2E5C]"
                  : "text-zinc-500 hover:bg-[#F8FAFC] dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -trangray-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search articles & guides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]/50 py-1.5 pl-8.5 pr-3 text-xs text-[#0A2E5C] placeholder-zinc-400 focus:border-[#FFC107] focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
        </div>
      </div>

      {/* 3. Featured Spotlight Card (When Category is All and No Search) */}
      {selectedCategory === "All" && !searchQuery && featuredPost && (
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="relative h-64 sm:h-72 w-full rounded-2xl overflow-hidden shadow-xs">
              <img 
                src={featuredPost.imageUrl} 
                alt={featuredPost.title} 
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
              />
              <span className="absolute top-3 left-3 rounded-lg bg-[#0A2E5C]/90 backdrop-blur-xs text-[#FFC107] px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                Featured Article
              </span>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1 font-semibold text-[#0B5ED7] dark:text-[#FFC107]">
                  <Tag className="h-3 w-3" /> {featuredPost.category}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {featuredPost.readTime}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {featuredPost.date}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-[#0A2E5C] dark:text-white leading-tight">
                {featuredPost.title}
              </h2>

              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {featuredPost.excerpt}
              </p>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-xs font-bold text-[#0A2E5C] dark:text-white">{featuredPost.author}</p>
                  <p className="text-[10px] text-zinc-400">{featuredPost.authorRole}</p>
                </div>

                <a
                  href={featuredPost.link || "https://blogs.jugaduji.com"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A2E5C] px-4 py-2 text-xs font-bold text-[#FFC107] hover:bg-[#141A24] transition dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                >
                  <span>Read Article</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Grid of Blog Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredPosts.map((post) => (
          <article 
            key={post.id}
            className="flex flex-col rounded-3xl border border-[#E5E7EB] bg-white shadow-xs dark:border-zinc-800 dark:bg-[#0A2E5C] overflow-hidden transition-all duration-300 hover:shadow-md hover:-trangray-y-1"
          >
            {/* Thumbnail */}
            <div className="relative h-44 w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
              <img 
                src={post.imageUrl} 
                alt={post.title} 
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
              />
              <span className="absolute top-3 left-3 rounded-lg bg-[#0A2E5C]/85 backdrop-blur-xs text-[#FFC107] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                {post.category}
              </span>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col p-5 space-y-3">
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {post.date}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {post.readTime}
                </span>
              </div>

              <h3 className="text-sm font-black text-[#0A2E5C] dark:text-white line-clamp-2 leading-snug">
                {post.title}
              </h3>

              <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3 leading-relaxed flex-1">
                {post.excerpt}
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                  By {post.author}
                </span>

                <a
                  href={post.link || "https://blogs.jugaduji.com"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#0B5ED7] dark:text-[#FFC107] hover:underline"
                >
                  <span>Read on Blog</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* 5. Bottom Sticky Exploration CTA */}
      <div className="rounded-3xl border border-[#E5E7EB] bg-linear-to-b from-white to-[#F8FAFC] p-6 text-center shadow-xs dark:border-zinc-800 dark:from-[#0A2E5C] dark:to-zinc-900 space-y-3">
        <Compass className="h-8 w-8 text-[#0B5ED7] dark:text-[#FFC107] mx-auto" />
        <h3 className="text-base sm:text-lg font-black text-[#0A2E5C] dark:text-white">
          Looking for More Preparation Resources?
        </h3>
        <p className="text-xs text-zinc-500 max-w-lg mx-auto">
          Visit the official Jugadu Ji blog to browse complete study plans, previous year question analyses, syllabus guides, and student motivational stories.
        </p>
        <div className="pt-2">
          <a
            href="https://blogs.jugaduji.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0A2E5C] px-6 py-2.5 text-xs font-black text-[#FFC107] hover:bg-black transition cursor-pointer"
          >
            <span>Visit blogs.jugaduji.com</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
