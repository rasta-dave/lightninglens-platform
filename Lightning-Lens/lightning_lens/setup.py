from setuptools import setup, find_packages

setup(
    name="lightning_lens",
    version="0.1.0",
    # Include the src directory directly
    package_dir={"lightning_lens": "src"},
    packages=["lightning_lens"] + ["lightning_lens." + p for p in find_packages("src")],
    install_requires=[
        "grpcio>=1.54.0",
        "protobuf>=4.21.0",
        "googleapis-common-protos>=1.56.0",
        "PyYAML>=6.0",
        "pandas>=1.5.0",
        "numpy>=1.23.0",
        "torch>=2.0.0",
        "networkx>=2.8.0",
        "plotly>=5.13.0",
        "pytest>=7.3.1",
    ],
    extras_require={
        "dev": [
            "pytest>=7.3.1",
            "pytest-cov",
            "black",
            "isort",
            "flake8",
            "jupyter>=1.0.0",
        ]
    },
    python_requires=">=3.8",
    author="Your Name",
    author_email="your.email@example.com",
    description="AI-driven liquidity prediction and optimization for Lightning Network nodes",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/lightninglens",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
    ],
)
