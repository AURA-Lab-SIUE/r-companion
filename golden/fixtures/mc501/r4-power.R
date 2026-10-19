# ---- Power analysis: the sample size your design needs ----
# How many messages per group would it take to detect your effect? pwr.t.test() answers that for
# a two-group t-test. Give it three of the four quantities and it solves for the one you leave
# out; n is left out here, so it returns the sample size needed in each group.
library(pwr)

pwr.t.test(
  d = 0.5,              # the effect size you want to be able to detect (0.5 is a medium Cohen's d)
  sig.level = 0.05,     # alpha: the false-positive rate you will accept
  power = 0.80,         # the chance of finding the effect if it is real (the 80% convention)
  type = "two.sample"   # two independent groups, the same shape as your Welch t-test
)
