import { Card } from "@superset/ui/card";
import { FadeUp } from "@/components/motion/FadeUp";
import { HeroParallax } from "@/components/motion/HeroParallax";
import { TiltCard } from "@/components/motion/TiltCard";
import { HeroCanvas } from "@/components/three/HeroCanvas";

export default function Home() {
	return (
		<main className="flex min-h-screen flex-col bg-black">
			{/* Hero Section with Parallax */}
			<HeroParallax className="relative min-h-screen flex items-center justify-center overflow-hidden pointer-events-none ">
				{/* Optional 3D Background */}
				<div className="absolute inset-0 z-0">
					<HeroCanvas className="w-full h-full" />
					<div className="absolute inset-0 bg-linear-to-b from-black/0 via-black/30 to-black" />
				</div>

				{/* Hero Content */}
				<div className="relative z-10 px-8 text-center text-white flex flex-col items-center justify-center gap-4 mt-[30rem]">
					<FadeUp>
						<h1 className="text-[14rem] font-bold leading-none -mt-16">
							Superset
						</h1>
					</FadeUp>
					<FadeUp delay={0.2}>
						<h2 className="text-2xl font-thin">
							The last app you'll ever need
						</h2>
					</FadeUp>
				</div>
			</HeroParallax>

			{/* Feature Cards Section */}
			<section className="py-24 px-8 bg-black">
				<div className="max-w-7xl mx-auto">
					<FadeUp>
						<h2 className="text-4xl font-bold text-center mb-16 text-white">
							Interactive Features
						</h2>
					</FadeUp>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
						<FadeUp delay={0.1}>
							<TiltCard>
								<Card className="p-8 h-full hover:shadow-2xl transition-shadow bg-zinc-900 border-zinc-800">
									<h3 className="text-2xl font-semibold mb-4 text-white">
										Framer Motion
									</h3>
									<p className="text-zinc-400">
										Smooth, production-ready animations for hover,
										scroll-reveal, and route transitions. DOM-based for optimal
										performance.
									</p>
								</Card>
							</TiltCard>
						</FadeUp>

						<FadeUp delay={0.2}>
							<TiltCard>
								<Card className="p-8 h-full hover:shadow-2xl transition-shadow bg-zinc-900 border-zinc-800">
									<h3 className="text-2xl font-semibold mb-4 text-white">
										React Three Fiber
									</h3>
									<p className="text-zinc-400">
										Optional lightweight 3D elements for hero sections and
										product showcases. WebGL-powered visual depth.
									</p>
								</Card>
							</TiltCard>
						</FadeUp>

						<FadeUp delay={0.3}>
							<TiltCard>
								<Card className="p-8 h-full hover:shadow-2xl transition-shadow bg-zinc-900 border-zinc-800">
									<h3 className="text-2xl font-semibold mb-4 text-white">
										Clean Architecture
									</h3>
									<p className="text-zinc-400">
										Composable, maintainable components. 95% DOM-based
										interactions with strategic 3D enhancements.
									</p>
								</Card>
							</TiltCard>
						</FadeUp>
					</div>
				</div>
			</section>

			{/* Additional Content Section */}
			<section className="py-24 px-8 bg-black">
				<div className="max-w-4xl mx-auto">
					<FadeUp>
						<Card className="p-12 bg-zinc-900 border-zinc-800">
							<h2 className="text-3xl font-bold mb-6 text-white">
								Built for Performance
							</h2>
							<p className="text-zinc-400 text-lg mb-4">
								Our approach prioritizes maintainability and performance. By
								keeping 95% of interactions DOM-based with Framer Motion, we
								ensure fast load times and smooth animations across all devices.
							</p>
							<p className="text-zinc-400 text-lg">
								Strategic use of React Three Fiber adds visual depth where it
								matters most, without compromising performance or accessibility.
							</p>
						</Card>
					</FadeUp>
				</div>
			</section>
		</main>
	);
}
