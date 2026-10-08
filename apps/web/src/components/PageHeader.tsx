/**
 * [WEB • COMPONENT] Reusable Page Header
 *
 * Title + description block used across portal pages.
 */

interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="bg-[#0A2E5C] pt-32 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#E5E7EB] tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-4 text-lg text-zinc-300 max-w-2xl mx-auto font-medium">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
