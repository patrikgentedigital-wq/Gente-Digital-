'use client';

import React from 'react';

interface LeadsSkeletonProps {
  viewMode: 'kanban' | 'list';
}

export function LeadsSkeleton({ viewMode }: LeadsSkeletonProps) {
  if (viewMode === 'kanban') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-pulse">
        {Array.from({ length: 5 }).map((_, colIndex) => (
          <div
            key={colIndex}
            className="bg-white/60 dark:bg-[#1e1e24]/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex flex-col gap-3 min-h-[450px]"
          >
            {/* Column Header Skeleton */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              <div className="h-5 w-6 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
            </div>

            {/* Cards Skeleton */}
            <div className="flex flex-col gap-3 flex-1 pt-1">
              {Array.from({ length: 3 }).map((_, cardIndex) => (
                <div
                  key={cardIndex}
                  className="bg-white dark:bg-[#27272a] rounded-xl p-4 border border-gray-100 dark:border-gray-700/60 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </div>
                  <div className="h-3 w-36 bg-gray-100 dark:bg-gray-800 rounded"></div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
                    <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                    <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1e1e24] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden animate-pulse">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {Array.from({ length: 8 }).map((_, rowIndex) => (
          <div key={rowIndex} className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-1/4">
              <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0"></div>
              <div className="flex flex-col gap-1 w-full">
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-3 w-1/2 bg-gray-100 dark:bg-gray-800 rounded"></div>
              </div>
            </div>
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
            <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
