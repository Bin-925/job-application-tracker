export default function PhoneFrame({ children }) {
    return (
        <div className="min-h-screen sm:bg-gray-100 sm:dark:bg-gray-900 flex justify-center sm:items-center sm:py-8">
            <div className="relative w-full max-w-sm min-h-screen sm:min-h-0 sm:h-[844px] bg-white dark:bg-black text-gray-900 dark:text-white sm:rounded-[2.5rem] sm:shadow-2xl sm:border-8 sm:border-gray-800 dark:sm:border-gray-700 overflow-hidden flex flex-col">
                {children}
            </div>
        </div>
    )
}